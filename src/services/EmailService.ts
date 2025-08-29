import axios from "axios";
import { prisma } from "../../prisma";
import { config } from "../config";
import processEmail from "../portal";
import { createEmailAccount } from "./cpanelService";
import { monitorEmailAccount, ParsedEmail } from "./emailMonitor";

class EmailService {
  private monitoredEmails: Set<string> = new Set();

  MODE = process.env.MODE!;
  DEV_ENDPOINT = process.env.DEV_ENDPOINT!;
  PROD_ENDPOINT = process.env.PROD_ENDPOINT!;

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

      // Inicia o monitoramento
      await this.startMonitoring(emailData);

      return {
        success: true,
        message: "Email criado e monitoramento iniciado com sucesso",
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
   * Inicia o monitoramento de um email específico
   */
  private async startMonitoring(emailData: { id: number; email: string }) {
    if (this.monitoredEmails.has(emailData.email)) {
      console.log(`⚠️ Email ${emailData.email} já está sendo monitorado`);
      return;
    }

    try {
      await monitorEmailAccount(
        emailData.email,
        config.defaultPwd,
        (parsedEmail) => this.handleNewEmail(emailData.id, parsedEmail)
      );

      this.monitoredEmails.add(emailData.email);
    } catch (error) {
      console.error(
        `❌ Erro ao iniciar monitoramento de ${emailData.email}:`,
        error
      );
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
          .post(this.MODE === "dev" ? this.DEV_ENDPOINT : this.PROD_ENDPOINT, {
            leadName: result.leadName,
            leadEmail: result.leadEmail,
            leadPhone: phone,
            vehicle: result.vehicle,
            from: result.from,
            to: result.to,
            portal: result.portal,
            valueRaw: result.valueRaw,
            value: result.value,
          })
          .then((res) => {
            const cleanedPhone = result.leadPhone.replace(/\D/g, "");
            console.log("Lead enviado para IAuto Brasil", cleanedPhone);
          });
      }
    } catch (error) {
      console.error("❌ Erro ao salvar email recebido:", error);
    }
  }

  /**
   * Inicia o monitoramento de todos os emails existentes no banco
   */
  async startAllMonitoring() {
    try {
      const allEmails = await prisma.email.findMany({
        where: { isActive: true },
      });

      console.log(
        `🔍 Iniciando monitoramento de ${allEmails.length} contas de email...`
      );

      for (const emailData of allEmails) {
        await this.startMonitoring(emailData);
        // Pequena pausa entre conexões para evitar sobrecarga
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log("✅ Monitoramento de todas as contas iniciado");
    } catch (error) {
      console.error("❌ Erro ao iniciar monitoramento geral:", error);
    }
  }

  /**
   * Para o monitoramento de um email específico
   */
  async stopMonitoring(email: string) {
    this.monitoredEmails.delete(email);
    console.log(`🛑 Monitoramento parado para ${email}`);
  }

  /**
   * Retorna a lista de emails sendo monitorados
   */
  getMonitoredEmails(): string[] {
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

export const emailService = new EmailService();
