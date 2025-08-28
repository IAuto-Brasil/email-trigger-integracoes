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
const cpanelService_1 = require("./cpanelService");
const emailMonitor_1 = require("./emailMonitor");
class EmailService {
    constructor() {
        this.monitoredEmails = new Set();
    }
    /**
     * Cria uma nova conta de email e inicia o monitoramento
     */
    async createAndMonitorEmail(companyId) {
        try {
            // Verifica se já existe email para esta empresa
            const existingEmail = await prisma_1.prisma.email.findFirst({
                where: {
                    companyId: Number(companyId),
                },
            });
            if (existingEmail) {
                // Se existe mas não está sendo monitorado, inicia monitoramento
                if (!this.monitoredEmails.has(existingEmail.email)) {
                    await this.startMonitoring(existingEmail);
                }
                return {
                    success: true,
                    message: "Email já existe e está sendo monitorado",
                    email: existingEmail.email,
                };
            }
            // Cria o email no cPanel
            console.log(`🔧 Criando conta de e-mail para empresa ${companyId}...`);
            const cpanelResponse = await (0, cpanelService_1.createEmailAccount)(companyId, config_1.config.defaultPwd);
            if (!cpanelResponse || cpanelResponse.errors) {
                throw new Error(`Erro ao criar email no cPanel: ${JSON.stringify(cpanelResponse?.errors)}`);
            }
            // Salva no banco de dados
            const emailData = await prisma_1.prisma.email.create({
                data: {
                    email: `${companyId}@${config_1.config.cpanel.domain}`,
                    companyId: Number(companyId),
                },
            });
            // Inicia o monitoramento
            await this.startMonitoring(emailData);
            console.log(`✅ Email ${emailData.email} criado e monitoramento iniciado`);
            return {
                success: true,
                message: "Email criado e monitoramento iniciado com sucesso",
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
     * Inicia o monitoramento de um email específico
     */
    async startMonitoring(emailData) {
        if (this.monitoredEmails.has(emailData.email)) {
            console.log(`⚠️ Email ${emailData.email} já está sendo monitorado`);
            return;
        }
        try {
            await (0, emailMonitor_1.monitorEmailAccount)(emailData.email, config_1.config.defaultPwd, (parsedEmail) => this.handleNewEmail(emailData.id, parsedEmail));
            this.monitoredEmails.add(emailData.email);
        }
        catch (error) {
            console.error(`❌ Erro ao iniciar monitoramento de ${emailData.email}:`, error);
        }
    }
    /**
     * Processa um novo email recebido
     */
    async handleNewEmail(emailId, parsedEmail) {
        try {
            // Prepara os anexos para salvar no banco
            const attachments = parsedEmail.attachments.map((att) => ({
                filename: att.filename,
                contentType: att.contentType,
                size: att.size,
                // Não salvamos o conteúdo do anexo no banco por questões de performance
                // Se necessário, pode ser salvo em um sistema de arquivos separado
            }));
            // Salva o email recebido no banco
            await prisma_1.prisma.receivedEmail.create({
                data: {
                    emailId,
                    fromEmail: parsedEmail.from,
                    toEmail: parsedEmail.to,
                    subject: parsedEmail.subject,
                    textContent: parsedEmail.text,
                    htmlContent: typeof parsedEmail.html === "string" ? parsedEmail.html : null,
                    attachments: attachments.length > 0 ? { set: attachments } : { set: [] },
                    metadata: {
                        hasAttachments: attachments.length > 0,
                        attachmentCount: attachments.length,
                        receivedAt: new Date().toISOString(),
                    },
                },
            });
            console.log(`📬 Novo email salvo - De: ${parsedEmail.from} | Assunto: ${parsedEmail.subject}`);
            // https://api.homologacao.iautobrasil.com.br/server-iauto/api/receive-message-portals
            // Esse endpoint aguardar um body parameters, como no exemplo abaixo
            //     {
            //   "leadName": "Tiago Dias Laureano",
            //   "leadEmail": "tiagodiaslaureano32@gmail.com",
            //   "leadPhone": "21 970042051",
            //   "vehicle": "Toyota Corolla 1.8 Dual VVT GLi Multi-Drive (Flex) 2018.0 2018 ",
            //   "from": "carros@icarros.com.br",
            //   "to": "iautobrasildev@gmail.com",
            //   "portal": "iCarros",
            //   "valueRaw": "R$ 84.900",
            //   "value": "84900"
            // }
            const result = (0, portal_1.default)(parsedEmail);
            if (result) {
                await axios_1.default.post("https://api.homologacao.iautobrasil.com.br/server-iauto/api/receive-message-portals", {
                    leadName: result.leadName,
                    leadEmail: result.leadEmail,
                    leadPhone: result.leadPhone,
                    vehicle: result.vehicle,
                    from: result.from,
                    to: result.to,
                    portal: result.portal,
                    valueRaw: result.valueRaw,
                    value: result.value,
                });
            }
            // Aqui você pode adicionar outras ações, como:
            // - Processar o conteúdo do email
            // - Integrar com outros sistemas
            // - Enviar notificação
        }
        catch (error) {
            console.error("❌ Erro ao salvar email recebido:", error);
        }
    }
    /**
     * Inicia o monitoramento de todos os emails existentes no banco
     */
    async startAllMonitoring() {
        try {
            const allEmails = await prisma_1.prisma.email.findMany({
                where: { isActive: true },
            });
            console.log(`🔍 Iniciando monitoramento de ${allEmails.length} contas de email...`);
            for (const emailData of allEmails) {
                await this.startMonitoring(emailData);
                // Pequena pausa entre conexões para evitar sobrecarga
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            console.log("✅ Monitoramento de todas as contas iniciado");
        }
        catch (error) {
            console.error("❌ Erro ao iniciar monitoramento geral:", error);
        }
    }
    /**
     * Para o monitoramento de um email específico
     */
    async stopMonitoring(email) {
        this.monitoredEmails.delete(email);
        console.log(`🛑 Monitoramento parado para ${email}`);
    }
    /**
     * Retorna a lista de emails sendo monitorados
     */
    getMonitoredEmails() {
        return Array.from(this.monitoredEmails);
    }
    /**
     * Para o monitoramento de todos os emails
     */
    async stopAllMonitoring() {
        this.monitoredEmails.clear();
        console.log("🛑 Monitoramento de todas as contas parado");
    }
}
exports.emailService = new EmailService();
//# sourceMappingURL=EmailService.js.map