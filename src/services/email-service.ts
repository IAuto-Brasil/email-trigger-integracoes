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

class EmailService {
  private scheduledInterval: NodeJS.Timeout | null = null;
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
          companyId: Number(companyId),
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
          companyId: Number(companyId),
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
  private async handleNewEmail(emailId: number, parsedEmail: ParsedEmail) {
    try {
      const result = await processEmail(parsedEmail);

      if (!result) {
        return;
      }

      let phone = result.leadPhone || "";

      phone = phone.replace(/\D/g, "");

      if (!phone.startsWith("55")) {
        phone = "55" + phone;
      }

      console.log(result);

      if (result) {
        await axios
          .post(
            "https://api.sistema.iautobrasil.com.br/server-iauto/api/receive-message-portals",
            {
              leadName: result.leadName,
              leadEmail: result.leadEmail,
              leadPhone: phone,
              vehicle: result.vehicle,
              from: result.from,
              to: result.to,
              portal: result.portal,
              valueRaw: result.valueRaw,
              value: result.value,
            }
          )
          .then((res) => {
            const cleanedPhone = result.leadPhone.replace(/\D/g, "");
            console.log("Lead enviado para IAuto Brasil", cleanedPhone);
          });
      }
    } catch (error) {
      console.error("❌ Erro ao se comunicar com o servidor:", error);

      await discordNotification.notifyServerCommunicationError(
        parsedEmail,
        error
      );
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
                await this.handleNewEmail(emailData.id, parsedEmail);
                successfullyProcessed++;
              } catch (error) {
                errors++;
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

      // NOTIFICAÇÃO DE ESTATÍSTICAS (apenas se houver atividade)
      if (totalNewEmails > 0 || errors > 0) {
        await discordNotification.notifyMonitoringStats({
          totalEmails: allEmails.length,
          newEmailsFound: totalNewEmails,
          processedSuccessfully: successfullyProcessed,
          errors,
          duration,
        });
      }
    } catch (error) {
      console.error("❌ Erro no ciclo de monitoramento:", error);
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

    this.runMonitoringCycle();

    discordNotification.notifySystemStart(intervalMinutes);

    this.scheduledInterval = setInterval(() => {
      this.runMonitoringCycle();
    }, intervalMs);

    setInterval(() => {
      this.runCleanup();
    }, 6 * 60 * 60 * 1000);
  }

  stopScheduledMonitoring() {
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
      this.scheduledInterval = null;
      console.log("🛑 Agendamento de monitoramento parado");
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
    console.log(
      `ℹ️ Solicitação para parar monitoramento de ${email} (será ignorado no próximo ciclo se inativo)`
    );
  }

  /**
   * Retorna a lista de emails sendo monitorados
   */
  getMonitoredEmails(): string[] {
    // Retorna emails ativos do banco em vez de cache em memória
    return [];
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
