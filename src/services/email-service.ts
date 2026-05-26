import axios from "axios";
import { prisma } from "../../prisma";
import { config } from "../config";
import processEmail from "../portal";
import { createEmailAccount } from "./cpanel-service";
import {
  monitorEmailAccountRefactor,
  ParsedEmail,
  cleanupOldProcessedEmails,
} from "./email-monitor";
import { discordNotification } from "./discord-notification";
import { normalizePhone } from "../utils/phone";
import { isPermanentWhatsAppError } from "../utils/errors";
import { isLeadPayload } from "../types/lead-payload";
import type { LeadPayload } from "../types/lead-payload";
import { isTransientImapError } from "../utils/imap-transient";
import { withTimeout } from "../utils/promise-timeout";
import { sleep } from "../utils/sleep";

/** Pausa entre um lead e outro (envio API / processamento) para respeitar rate limit. */
const LEAD_PROCESSING_DELAY_MS = 1000;

class EmailService {
  private scheduledInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private cycleStartedAt: number | null = null;
  /** Fim do último ciclo IMAP concluído (não atualiza se o ciclo anterior ainda estava em execução e este foi ignorado). */
  private lastEmailCheckAt: Date | null = null;

  /**
   * Cria uma nova conta de email e inicia o monitoramento
   */
  async createAndMonitorEmail(
    companyId: string
  ): Promise<{ success: boolean; message: string; email?: string }> {
    try {
      // Verifica se já existe email para esta empresa
      const existingEmail = await prisma.email.findFirst({
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
      const cpanelResponse = await createEmailAccount(
        companyId,
        config.defaultPwd
      );

      if (!cpanelResponse || cpanelResponse.errors) {
        throw new Error(
          `Erro ao criar email no cPanel: ${JSON.stringify(
            cpanelResponse?.errors
          )}`
        );
      }

      // Salva no banco de dados
      const emailData = await prisma.email.create({
        data: {
          email: `${companyId}@${config.cpanel.domain}`,
          companyId,
        },
      });

      await discordNotification.notifyEmailCreated(companyId, emailData.email);

      return {
        success: true,
        message: "Email criado e será monitorado no próximo ciclo",
        email: emailData.email,
      };
    } catch (error) {
      console.error(
        `❌ Erro ao criar/monitorar email para empresa ${companyId}:`,
        error
      );
      return {
        success: false,
        message: `Erro: ${
          error instanceof Error ? error.message : "Erro desconhecido"
        }`,
      };
    }
  }

  /**
   * Processa um novo email recebido
   */
  private async handleNewEmail(
    accountEmail: string,
    _emailId: number,
    parsedEmail: ParsedEmail
  ) {
    try {
      // 1) Busca no cache primeiro, com validação de tipo
      const cached = await prisma.parsedEmailCache.findUnique({
        where: { messageId: parsedEmail.messageId },
      });

      let result: LeadPayload | null = null;
      if (cached?.payload && isLeadPayload(cached.payload)) {
        result = cached.payload;
      }

      // 2) Se não tem cache válido, processa com GPT e salva
      if (!result) {
        const processed = await processEmail(parsedEmail);
        if (!processed || !isLeadPayload(processed)) {
          return;
        }

        result = processed;

        await prisma.parsedEmailCache.upsert({
          where: { messageId: parsedEmail.messageId },
          update: { payload: result },
          create: { messageId: parsedEmail.messageId, payload: result },
        });
      }

      const normalizedPhone = normalizePhone(result.leadPhone || null);

      console.log(result);

      if (result) {
        try {
          if (!normalizedPhone) {
            await discordNotification.notifyWhatsAppError(
              result,
              result.leadPhone || "",
              "Número inválido (normalização falhou)"
            );
            // Não relança → email será marcado como processado
            return;
          }

          const leadResponse = await axios.post(
            config.receiveLeadUrl,
            {
              leadName: result.leadName,
              leadEmail: result.leadEmail,
              leadPhone: normalizedPhone,
              vehicle: result.vehicle,
              from: result.from,
              to: result.to,
              portal: result.portal,
              valueRaw: result.valueRaw,
              value: result.value,
            },
            {
              timeout: 45_000,
              validateStatus: () => true,
            }
          );

          if (leadResponse.status >= 400) {
            const httpErr: any = new Error(`HTTP ${leadResponse.status}`);
            httpErr.response = leadResponse;
            throw httpErr;
          }

          console.log("Lead enviado para IAuto Brasil", normalizedPhone);

          const valueNum = Number.parseInt(String(result.value), 10);
          if (
            result.value &&
            !Number.isNaN(valueNum) &&
            valueNum > 5_000_000
          ) {
            await discordNotification.notifyHighValueLead(
              result,
              accountEmail,
              normalizedPhone
            );
          }
        } catch (httpError: any) {
          console.error("❌ Em comunicação com servidor:", httpError);

          let isPermanentError = false;

          if (httpError?.response?.status === 400) {
            const serverMessage = httpError.response.data?.message || "";

            if (
              isPermanentWhatsAppError(httpError, serverMessage, normalizedPhone)
            ) {
              isPermanentError = true;
              console.log(
                `⚠️ Erro permanente - Telefone ${
                  normalizedPhone || result.leadPhone || "N/A"
                }. Marcar como processado para evitar reprocessamento.`
              );

              await discordNotification.notifyWhatsAppError(
                result,
                normalizedPhone || result.leadPhone || "",
                serverMessage || "Número inválido ou inexistente"
              );
            } else {
              await discordNotification.notifyServerCommunicationError(
                result,
                httpError,
                result.to?.split("@")[0] ?? ""
              );
            }
          } else {
            await discordNotification.notifyServerCommunicationError(
              result,
              httpError,
              result.to?.split("@")[0] ?? ""
            );
          }

          if (!isPermanentError) {
            throw httpError;
          }
        }
      }
    } catch (error) {
      console.error(
        `❌ Erro geral no processamento (${accountEmail}, ${parsedEmail.messageId}):`,
        error
      );
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
    } catch (unexpected) {
      console.error("❌ [monitoring] exceção inesperada fora do try do ciclo:", unexpected);
    } finally {
      this.isRunning = false;
      this.cycleStartedAt = null;
      this.lastEmailCheckAt = new Date();
    }
  }

  private async runMonitoringCycleBody() {
    const startTime = Date.now();
    const mon = config.monitoring;

    let totalNewEmails = 0;
    let successfullyProcessed = 0;
    let errors = 0;
    let whatsappErrors = 0;
    let serverErrors = 0;

    try {
      const allEmails = await prisma.email.findMany({
        where: { isActive: true },
      });

      console.log(
        `🔄 [${new Date().toLocaleTimeString()}] Iniciando ciclo de monitoramento de ${
          allEmails.length
        } contas...`
      );

      const promises = allEmails.map(async (emailData) => {
        try {
          const imapPass =
            (emailData.imapPassword?.trim() || config.defaultPwd) ?? "";
          if (!imapPass) {
            console.error(
              `❌ ${emailData.email}: sem senha IMAP (defina DEFAULT_PWD ou imapPassword no banco)`
            );
            errors++;
            return;
          }

          const onNewMail = async (parsedEmail: ParsedEmail) => {
            totalNewEmails++;
            try {
              await this.handleNewEmail(
                emailData.email,
                emailData.id,
                parsedEmail
              );
              successfullyProcessed++;
            } catch (error: any) {
              errors++;

              if (
                error?.response?.status === 400 &&
                error?.response?.data?.message?.includes("WhatsApp")
              ) {
                whatsappErrors++;
              } else if (error?.response) {
                serverErrors++;
              }

              throw error;
            } finally {
              await sleep(LEAD_PROCESSING_DELAY_MS);
            }
          };

          for (let attempt = 0; attempt < mon.imapFullCycleRetryMax; attempt++) {
            try {
              await withTimeout(
                monitorEmailAccountRefactor(
                  emailData.email,
                  imapPass,
                  onNewMail
                ),
                mon.perAccountImapTimeoutMs,
                `IMAP ${emailData.email}`
              );
              break;
            } catch (e) {
              const canRetry =
                attempt < mon.imapFullCycleRetryMax - 1 &&
                isTransientImapError(e);
              if (canRetry) {
                console.warn(
                  `↻ Nova tentativa IMAP (conta) ${emailData.email} após falha transiente (tentativa ${
                    attempt + 2
                  }/${mon.imapFullCycleRetryMax})`
                );
                await sleep(mon.imapFullCycleRetryDelayMs);
                continue;
              }
              throw e;
            }
          }
        } catch (error) {
          console.error(`❌ Erro ao monitorar ${emailData.email}:`, error);
          errors++;
        }
      });

      await Promise.allSettled(promises);

      const duration = Date.now() - startTime;
      console.log(
        `✅ [${new Date().toLocaleTimeString()}] Ciclo concluído em ${duration}ms`
      );

      if (totalNewEmails > 0 || errors > 0) {
        try {
          await discordNotification.notifyMonitoringStats({
            totalEmails: allEmails.length,
            newEmailsFound: totalNewEmails,
            processedSuccessfully: successfullyProcessed,
            errors,
            whatsappErrors,
            serverErrors,
            duration,
          });
        } catch (notifyErr) {
          console.error("❌ Falha ao enviar relatório do ciclo ao Discord:", notifyErr);
        }
      }
    } catch (error: any) {
      console.error("❌ Erro no ciclo de monitoramento:", error);
      errors++;

      try {
        await discordNotification.notifyCriticalCycleError(error);
      } catch (notifyErr) {
        console.error("❌ Falha ao notificar Discord (ciclo crítico):", notifyErr);
      }
    }
  }

  /** ISO 8601 do término do último ciclo de verificação de e-mail, ou null se nunca rodou. */
  getLastEmailCheckAtIso(): string | null {
    return this.lastEmailCheckAt?.toISOString() ?? null;
  }

  /**
   * Inicia o agendamento do monitoramento
   */
  startScheduledMonitoring(intervalMinutes: number = 1) {
    this.stopScheduledMonitoring();

    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(
      `⏰ Iniciando monitoramento agendado a cada ${intervalMinutes} minuto(s)`
    );

    void discordNotification
      .notifySystemStart(intervalMinutes)
      .catch((err) =>
        console.error("❌ Falha ao notificar Discord (início do monitor):", err)
      );

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
      await cleanupOldProcessedEmails(30); // mantém últimos 30 dias
    } catch (error) {
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
  async stopMonitoring(email: string) {
    const updated = await prisma.email.updateMany({
      where: { email },
      data: { isActive: false },
    });
    console.log(
      `ℹ️ Monitoramento desativado para ${email} (${updated.count} registro(s))`
    );
  }

  /**
   * Retorna a lista de emails ativos no banco
   */
  async getMonitoredEmails(): Promise<string[]> {
    const rows = await prisma.email.findMany({
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
      await discordNotification.notifySystemStop();
    } catch (e) {
      console.error("❌ Falha ao notificar Discord (parada):", e);
    }
    console.log("🛑 Monitoramento de todas as contas parado");
  }

  /**
   * Retorna estatísticas do sistema
   */
  async getStats() {
    try {
      const totalEmails = await prisma.email.count({
        where: { isActive: true },
      });

      const processedToday = await prisma.processedEmail.count({
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
        currentCycleRuntimeMs:
          this.isRunning && this.cycleStartedAt != null
            ? Date.now() - this.cycleStartedAt
            : null,
        lastEmailCheckAt: this.getLastEmailCheckAtIso(),
      };
    } catch (error) {
      console.error("❌ Erro ao obter estatísticas:", error);
      return null;
    }
  }
}

export const emailService = new EmailService();
