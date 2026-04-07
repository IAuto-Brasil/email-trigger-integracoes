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
import { discordNotification, NotificationType } from "./discord-notification";
import { normalizePhone } from "../utils/phone";
import { isPermanentWhatsAppError } from "../utils/errors";

class EmailService {
  private scheduledInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

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
    // Tipos e guardas para o payload do GPT/cache
    type LeadPayload = {
      leadName: string;
      leadEmail?: string | null;
      leadPhone?: string | null;
      vehicle?: string | null;
      from: string;
      to: string;
      portal: string;
      valueRaw?: string | null;
      value?: string | null;
    };
    const isLeadPayload = (data: any): data is LeadPayload => {
      return (
        data &&
        typeof data === "object" &&
        typeof data.leadName === "string" &&
        typeof data.to === "string" &&
        typeof data.from === "string" &&
        typeof data.portal === "string"
      );
    };

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
            await discordNotification.sendNotification(
              NotificationType.SUCCESS,
              "Lead de Alto Valor Processado",
              `Lead de ${result.leadName} processado com sucesso`,
              {
                Valor: result.valueRaw,
                Veículo: result.vehicle,
                Portal: result.portal,
                Telefone: normalizedPhone,
              }
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
   * Executa um ciclo de monitoramento de todos os emails
   */
  async runMonitoringCycle() {
    if (this.isRunning) {
      console.log("⚠️ Ciclo anterior ainda em execução, pulando...");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

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
          await monitorEmailAccountRefactor(
            emailData.email,
            config.defaultPwd,
            async (parsedEmail) => {
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

                // Categoriza os erros
                if (
                  error?.response?.status === 400 &&
                  error?.response?.data?.message?.includes("WhatsApp")
                ) {
                  whatsappErrors++;
                } else if (error?.response) {
                  serverErrors++;
                }

                throw error;
              }
            }
          );
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

      // Notificação de estatísticas detalhadas (apenas se houver atividade)
      if (totalNewEmails > 0 || errors > 0) {
        const statsDetails = {
          "Contas Monitoradas": String(allEmails.length),
          "E-mails Novos": String(totalNewEmails),
          "Processados com Sucesso": String(successfullyProcessed),
          "Erros Total": String(errors),
          "Erros WhatsApp": String(whatsappErrors),
          "Erros Servidor": String(serverErrors),
          Duração: `${duration}ms`,
          "Taxa de Sucesso":
            totalNewEmails > 0
              ? `${Math.round((successfullyProcessed / totalNewEmails) * 100)}%`
              : "N/A",
        };

        const notificationType =
          errors > successfullyProcessed
            ? NotificationType.WARNING
            : errors > 0
            ? NotificationType.INFO
            : NotificationType.SUCCESS;

        await discordNotification.sendNotification(
          notificationType,
          "📊 Relatório do Ciclo de Monitoramento",
          `Ciclo de verificação concluído`,
          statsDetails
        );
      }
    } catch (error: any) {
      console.error("❌ Erro no ciclo de monitoramento:", error);

      await discordNotification.sendNotification(
        NotificationType.ERROR,
        "💥 Erro Crítico no Sistema",
        "Falha geral no ciclo de monitoramento",
        {
          Erro: error?.message || String(error),
          Timestamp: new Date().toLocaleString("pt-BR"),
        }
      );

      errors++;
    } finally {
      this.isRunning = false;
    }
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

    discordNotification.notifySystemStart(intervalMinutes);

    this.runMonitoringCycle();

    this.scheduledInterval = setInterval(() => {
      this.runMonitoringCycle();
    }, intervalMs);

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => {
      void this.runCleanup();
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
    await discordNotification.notifySystemStop();
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
      };
    } catch (error) {
      console.error("❌ Erro ao obter estatísticas:", error);
      return null;
    }
  }
}

export const emailService = new EmailService();
