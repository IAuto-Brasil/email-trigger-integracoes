"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../../prisma");
const config_1 = require("../config");
const portal_1 = __importDefault(require("../portal"));
const cpanel_service_1 = require("./cpanel-service");
const email_monitor_1 = require("./email-monitor");
const discord_notification_1 = require("./discord-notification");
const phone_1 = require("../utils/phone");
const errors_1 = require("../utils/errors");
const lead_payload_1 = require("../types/lead-payload");
const imap_transient_1 = require("../utils/imap-transient");
const promise_timeout_1 = require("../utils/promise-timeout");
const sleep_1 = require("../utils/sleep");
/** Pausa entre um lead e outro (envio API / processamento) para respeitar rate limit. */
const LEAD_PROCESSING_DELAY_MS = 1000;
class EmailService {
    constructor() {
        this.scheduledInterval = null;
        this.cleanupInterval = null;
        this.isRunning = false;
        this.cycleStartedAt = null;
        /** Fim do último ciclo IMAP concluído (não atualiza se o ciclo anterior ainda estava em execução e este foi ignorado). */
        this.lastEmailCheckAt = null;
    }
    /**
     * Cria uma nova conta de email e inicia o monitoramento
     */
    async createAndMonitorEmail(companyId) {
        try {
            // Verifica se já existe email para esta empresa
            const existingEmail = await prisma_1.prisma.email.findFirst({
                where: {
                    companyId,
                },
            });
            if (existingEmail) {
                return {
                    success: true,
                    message: "Email já existe e será monitorado no próximo ciclo",
                    email: existingEmail.email,
                };
            }
            // Cria o email no cPanel
            console.log(`🔧 Criando conta de e-mail para empresa ${companyId}...`);
            const cpanelResponse = await (0, cpanel_service_1.createEmailAccount)(companyId, config_1.config.defaultPwd);
            if (!cpanelResponse || cpanelResponse.errors) {
                throw new Error(`Erro ao criar email no cPanel: ${JSON.stringify(cpanelResponse?.errors)}`);
            }
            // Salva no banco de dados
            const emailData = await prisma_1.prisma.email.create({
                data: {
                    email: `${companyId}@${config_1.config.cpanel.domain}`,
                    companyId,
                },
            });
            await discord_notification_1.discordNotification.notifyEmailCreated(companyId, emailData.email);
            return {
                success: true,
                message: "Email criado e será monitorado no próximo ciclo",
                email: emailData.email,
            };
        }
        catch (error) {
            console.error(`❌ Erro ao criar/monitorar email para empresa ${companyId}:`, error);
            return {
                success: false,
                message: `Erro: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
            };
        }
    }
    /**
     * Processa um novo email recebido
     */
    async handleNewEmail(accountEmail, _emailId, parsedEmail) {
        try {
            // 1) Busca no cache primeiro, com validação de tipo
            const cached = await prisma_1.prisma.parsedEmailCache.findUnique({
                where: { messageId: parsedEmail.messageId },
            });
            let result = null;
            if (cached?.payload && (0, lead_payload_1.isLeadPayload)(cached.payload)) {
                result = cached.payload;
            }
            // 2) Se não tem cache válido, processa com GPT e salva
            if (!result) {
                const processed = await (0, portal_1.default)(parsedEmail);
                if (!processed || !(0, lead_payload_1.isLeadPayload)(processed)) {
                    return;
                }
                result = processed;
                await prisma_1.prisma.parsedEmailCache.upsert({
                    where: { messageId: parsedEmail.messageId },
                    update: { payload: result },
                    create: { messageId: parsedEmail.messageId, payload: result },
                });
            }
            const normalizedPhone = (0, phone_1.normalizePhone)(result.leadPhone || null);
            console.log(result);
            if (result) {
                try {
                    if (!normalizedPhone) {
                        await discord_notification_1.discordNotification.notifyWhatsAppError(result, result.leadPhone || "", "Número inválido (normalização falhou)");
                        // Não relança → email será marcado como processado
                        return;
                    }
                    const leadResponse = await axios_1.default.post(config_1.config.receiveLeadUrl, {
                        leadName: result.leadName,
                        leadEmail: result.leadEmail,
                        leadPhone: normalizedPhone,
                        vehicle: result.vehicle,
                        from: result.from,
                        to: result.to,
                        portal: result.portal,
                        valueRaw: result.valueRaw,
                        value: result.value,
                    }, {
                        timeout: 45000,
                        validateStatus: () => true,
                    });
                    if (leadResponse.status >= 400) {
                        const httpErr = new Error(`HTTP ${leadResponse.status}`);
                        httpErr.response = leadResponse;
                        throw httpErr;
                    }
                    console.log("Lead enviado para IAuto Brasil", normalizedPhone);
                    const valueNum = Number.parseInt(String(result.value), 10);
                    if (result.value &&
                        !Number.isNaN(valueNum) &&
                        valueNum > 5000000) {
                        await discord_notification_1.discordNotification.notifyHighValueLead(result, accountEmail, normalizedPhone);
                    }
                }
                catch (httpError) {
                    console.error("❌ Em comunicação com servidor:", httpError);
                    let isPermanentError = false;
                    if (httpError?.response?.status === 400) {
                        const serverMessage = httpError.response.data?.message || "";
                        if ((0, errors_1.isPermanentWhatsAppError)(httpError, serverMessage, normalizedPhone)) {
                            isPermanentError = true;
                            console.log(`⚠️ Erro permanente - Telefone ${normalizedPhone || result.leadPhone || "N/A"}. Marcar como processado para evitar reprocessamento.`);
                            await discord_notification_1.discordNotification.notifyWhatsAppError(result, normalizedPhone || result.leadPhone || "", serverMessage || "Número inválido ou inexistente");
                        }
                        else {
                            await discord_notification_1.discordNotification.notifyServerCommunicationError(result, httpError, result.to?.split("@")[0] ?? "");
                        }
                    }
                    else {
                        await discord_notification_1.discordNotification.notifyServerCommunicationError(result, httpError, result.to?.split("@")[0] ?? "");
                    }
                    if (!isPermanentError) {
                        throw httpError;
                    }
                }
            }
        }
        catch (error) {
            console.error(`❌ Erro geral no processamento (${accountEmail}, ${parsedEmail.messageId}):`, error);
            throw error;
        }
    }
    /**
     * Garante `isRunning` e `lastEmailCheckAt` coerentes e evita rejeições não tratadas.
     */
    async runMonitoringCycle() {
        if (this.isRunning) {
            console.log("⚠️ Ciclo anterior ainda em execução, pulando...");
            return;
        }
        this.isRunning = true;
        this.cycleStartedAt = Date.now();
        try {
            await this.runMonitoringCycleBody();
        }
        catch (unexpected) {
            console.error("❌ [monitoring] exceção inesperada fora do try do ciclo:", unexpected);
        }
        finally {
            this.isRunning = false;
            this.cycleStartedAt = null;
            this.lastEmailCheckAt = new Date();
        }
    }
    async runMonitoringCycleBody() {
        const startTime = Date.now();
        const mon = config_1.config.monitoring;
        let totalNewEmails = 0;
        let successfullyProcessed = 0;
        let errors = 0;
        let whatsappErrors = 0;
        let serverErrors = 0;
        try {
            const allEmails = await prisma_1.prisma.email.findMany({
                where: { isActive: true },
            });
            console.log(`🔄 [${new Date().toLocaleTimeString()}] Iniciando ciclo de monitoramento de ${allEmails.length} contas...`);
            const promises = allEmails.map(async (emailData) => {
                try {
                    const imapPass = (emailData.imapPassword?.trim() || config_1.config.defaultPwd) ?? "";
                    if (!imapPass) {
                        console.error(`❌ ${emailData.email}: sem senha IMAP (defina DEFAULT_PWD ou imapPassword no banco)`);
                        errors++;
                        return;
                    }
                    const onNewMail = async (parsedEmail) => {
                        totalNewEmails++;
                        try {
                            await this.handleNewEmail(emailData.email, emailData.id, parsedEmail);
                            successfullyProcessed++;
                        }
                        catch (error) {
                            errors++;
                            if (error?.response?.status === 400 &&
                                error?.response?.data?.message?.includes("WhatsApp")) {
                                whatsappErrors++;
                            }
                            else if (error?.response) {
                                serverErrors++;
                            }
                            throw error;
                        }
                        finally {
                            await (0, sleep_1.sleep)(LEAD_PROCESSING_DELAY_MS);
                        }
                    };
                    for (let attempt = 0; attempt < mon.imapFullCycleRetryMax; attempt++) {
                        try {
                            await (0, promise_timeout_1.withTimeout)((0, email_monitor_1.monitorEmailAccountRefactor)(emailData.email, imapPass, onNewMail), mon.perAccountImapTimeoutMs, `IMAP ${emailData.email}`);
                            break;
                        }
                        catch (e) {
                            const canRetry = attempt < mon.imapFullCycleRetryMax - 1 &&
                                (0, imap_transient_1.isTransientImapError)(e);
                            if (canRetry) {
                                console.warn(`↻ Nova tentativa IMAP (conta) ${emailData.email} após falha transiente (tentativa ${attempt + 2}/${mon.imapFullCycleRetryMax})`);
                                await (0, sleep_1.sleep)(mon.imapFullCycleRetryDelayMs);
                                continue;
                            }
                            throw e;
                        }
                    }
                }
                catch (error) {
                    console.error(`❌ Erro ao monitorar ${emailData.email}:`, error);
                    errors++;
                }
            });
            await Promise.allSettled(promises);
            const duration = Date.now() - startTime;
            console.log(`✅ [${new Date().toLocaleTimeString()}] Ciclo concluído em ${duration}ms`);
            if (totalNewEmails > 0 || errors > 0) {
                try {
                    await discord_notification_1.discordNotification.notifyMonitoringStats({
                        totalEmails: allEmails.length,
                        newEmailsFound: totalNewEmails,
                        processedSuccessfully: successfullyProcessed,
                        errors,
                        whatsappErrors,
                        serverErrors,
                        duration,
                    });
                }
                catch (notifyErr) {
                    console.error("❌ Falha ao enviar relatório do ciclo ao Discord:", notifyErr);
                }
            }
        }
        catch (error) {
            console.error("❌ Erro no ciclo de monitoramento:", error);
            errors++;
            try {
                await discord_notification_1.discordNotification.notifyCriticalCycleError(error);
            }
            catch (notifyErr) {
                console.error("❌ Falha ao notificar Discord (ciclo crítico):", notifyErr);
            }
        }
    }
    /** ISO 8601 do término do último ciclo de verificação de e-mail, ou null se nunca rodou. */
    getLastEmailCheckAtIso() {
        return this.lastEmailCheckAt?.toISOString() ?? null;
    }
    /**
     * Inicia o agendamento do monitoramento
     */
    startScheduledMonitoring(intervalMinutes = 1) {
        this.stopScheduledMonitoring();
        const intervalMs = intervalMinutes * 60 * 1000;
        console.log(`⏰ Iniciando monitoramento agendado a cada ${intervalMinutes} minuto(s)`);
        void discord_notification_1.discordNotification
            .notifySystemStart(intervalMinutes)
            .catch((err) => console.error("❌ Falha ao notificar Discord (início do monitor):", err));
        void this.runMonitoringCycle().catch((err) => {
            console.error("❌ Ciclo de monitoramento (inicial) rejeitou:", err);
        });
        this.scheduledInterval = setInterval(() => {
            void this.runMonitoringCycle().catch((err) => {
                console.error("❌ Ciclo de monitoramento (agendado) rejeitou:", err);
            });
        }, intervalMs);
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cleanupInterval = setInterval(() => {
            void this.runCleanup().catch((err) => {
                console.error("❌ Erro na limpeza agendada:", err);
            });
        }, 6 * 60 * 60 * 1000);
    }
    stopScheduledMonitoring() {
        if (this.scheduledInterval) {
            clearInterval(this.scheduledInterval);
            this.scheduledInterval = null;
            console.log("🛑 Agendamento de monitoramento parado");
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
    async runCleanup() {
        try {
            console.log("🧹 Executando limpeza de emails antigos...");
            await (0, email_monitor_1.cleanupOldProcessedEmails)(30); // mantém últimos 30 dias
        }
        catch (error) {
            console.error("❌ Erro na limpeza:", error);
        }
    }
    /**
     * MÉTODO LEGADO - Mantido para compatibilidade
     * @deprecated Use startScheduledMonitoring() em vez disso
     */
    async startAllMonitoring() {
        console.log("⚠️ Método legado chamado. Use startScheduledMonitoring()");
        await this.runMonitoringCycle();
    }
    /**
     * Para o monitoramento de um email específico (para compatibilidade)
     */
    async stopMonitoring(email) {
        const updated = await prisma_1.prisma.email.updateMany({
            where: { email },
            data: { isActive: false },
        });
        console.log(`ℹ️ Monitoramento desativado para ${email} (${updated.count} registro(s))`);
    }
    /**
     * Retorna a lista de emails ativos no banco
     */
    async getMonitoredEmails() {
        const rows = await prisma_1.prisma.email.findMany({
            where: { isActive: true },
            select: { email: true },
            orderBy: { id: "asc" },
        });
        return rows.map((r) => r.email);
    }
    /**
     * Para o monitoramento de todos os emails
     */
    async stopAllMonitoring() {
        this.stopScheduledMonitoring();
        try {
            await discord_notification_1.discordNotification.notifySystemStop();
        }
        catch (e) {
            console.error("❌ Falha ao notificar Discord (parada):", e);
        }
        console.log("🛑 Monitoramento de todas as contas parado");
    }
    /**
     * Retorna estatísticas do sistema
     */
    async getStats() {
        try {
            const totalEmails = await prisma_1.prisma.email.count({
                where: { isActive: true },
            });
            const processedToday = await prisma_1.prisma.processedEmail.count({
                where: {
                    processedAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    },
                },
            });
            return {
                totalActiveEmails: totalEmails,
                processedToday,
                isScheduledRunning: this.scheduledInterval !== null,
                isCurrentlyRunning: this.isRunning,
                /** ms desde o início do ciclo atual, ou `null` se nenhum ciclo em andamento. */
                currentCycleRuntimeMs: this.isRunning && this.cycleStartedAt != null
                    ? Date.now() - this.cycleStartedAt
                    : null,
                lastEmailCheckAt: this.getLastEmailCheckAtIso(),
            };
        }
        catch (error) {
            console.error("❌ Erro ao obter estatísticas:", error);
            return null;
        }
    }
}
exports.emailService = new EmailService();
//# sourceMappingURL=email-service.js.map