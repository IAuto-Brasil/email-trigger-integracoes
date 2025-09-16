import axios from "axios";

const DISCORD_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1417580521776480426/_thqOFyKYn5ikzw6_qrhx_Hetv7qgSqvxJYkjI0x-HlilR6SLhhJSp52fo7yq-HeXK1G";

export enum NotificationType {
  ERROR = "error",
  WARNING = "warning",
  INFO = "info",
  SUCCESS = "success",
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
  footer?: {
    text: string;
  };
}

interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

class DiscordNotificationService {
  private async sendToDiscord(message: DiscordMessage): Promise<void> {
    try {
      await axios.post(DISCORD_WEBHOOK_URL, message, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 segundos
      });
    } catch (error) {
      // Evita loop infinito de notificações de erro
      console.error("Falha ao enviar notificação para Discord:", error);
    }
  }

  private getColorByType(type: NotificationType): number {
    const colors = {
      [NotificationType.ERROR]: 0xff0000, // Vermelho
      [NotificationType.WARNING]: 0xffa500, // Laranja
      [NotificationType.INFO]: 0x0099ff, // Azul
      [NotificationType.SUCCESS]: 0x00ff00, // Verde
    };
    return colors[type];
  }

  private getEmojiByType(type: NotificationType): string {
    const emojis = {
      [NotificationType.ERROR]: "🔴",
      [NotificationType.WARNING]: "🟡",
      [NotificationType.INFO]: "🔵",
      [NotificationType.SUCCESS]: "🟢",
    };
    return emojis[type];
  }

  /**
   * Envia uma notificação simples
   */
  async sendNotification(
    type: NotificationType,
    title: string,
    message: string,
    details?: Record<string, any>
  ): Promise<void> {
    const emoji = this.getEmojiByType(type);
    const color = this.getColorByType(type);

    const embed: DiscordEmbed = {
      title: `${emoji} ${title}`,
      description: message,
      color,
      timestamp: new Date().toISOString(),
      footer: {
        text: "Sistema de Monitoramento de E-mail",
      },
    };

    // Adiciona campos extras se fornecidos
    if (details) {
      embed.fields = Object.entries(details).map(([key, value]) => ({
        name: key,
        value: String(value),
        inline: true,
      }));
    }

    await this.sendToDiscord({ embeds: [embed] });
  }

  /**
   * Notifica erro específico do cPanel
   */
  async notifyCpanelError(
    operation: string,
    companyId: string,
    error: any
  ): Promise<void> {
    await this.sendNotification(
      NotificationType.ERROR,
      "Erro no cPanel",
      `Falha na operação: ${operation}`,
      {
        "Empresa ID": companyId,
        Erro: error?.message || String(error),
        Timestamp: new Date().toLocaleString("pt-BR"),
      }
    );
  }

  /**
   * Notifica erro de conexão de e-mail
   */
  async notifyEmailConnectionError(email: string, error: any): Promise<void> {
    await this.sendNotification(
      NotificationType.ERROR,
      "Erro de Conexão IMAP",
      `Falha ao conectar com a conta de e-mail`,
      {
        "E-mail": email,
        Erro: error?.message || String(error),
        Timestamp: new Date().toLocaleString("pt-BR"),
      }
    );
  }

  /**
   * Notifica erro no processamento de e-mail
   */
  async notifyEmailProcessingError(
    email: string,
    messageId: string,
    error: any
  ): Promise<void> {
    await this.sendNotification(
      NotificationType.ERROR,
      "Erro no Processamento de E-mail",
      `Falha ao processar mensagem recebida`,
      {
        Conta: email,
        "Message ID": messageId,
        Erro: error?.message || String(error),
        Timestamp: new Date().toLocaleString("pt-BR"),
      }
    );
  }

  /**
   * Notifica erro na comunicação com servidor
   */
  async notifyServerCommunicationError(
    leadData: any,
    error: any
  ): Promise<void> {
    await this.sendNotification(
      NotificationType.ERROR,
      "Erro de Comunicação com Servidor",
      `Falha ao enviar lead para IAuto Brasil`,
      {
        Lead: leadData?.leadName || "N/A",
        "E-mail Lead": leadData?.leadEmail || "N/A",
        Telefone: leadData?.leadPhone || "N/A",
        Portal: leadData?.portal || "N/A",
        Erro: error?.message || String(error),
        Timestamp: new Date().toLocaleString("pt-BR"),
      }
    );
  }

  /**
   * Notifica sucesso na criação de e-mail
   */
  async notifyEmailCreated(companyId: string, email: string): Promise<void> {
    await this.sendNotification(
      NotificationType.SUCCESS,
      "E-mail Criado com Sucesso",
      `Nova conta de e-mail criada e monitoramento iniciado`,
      {
        "Empresa ID": companyId,
        "E-mail": email,
        Status: "Monitoramento ativo",
        Timestamp: new Date().toLocaleString("pt-BR"),
      }
    );
  }

  /**
   * Notifica estatísticas do ciclo de monitoramento
   */
  async notifyMonitoringStats(stats: {
    totalEmails: number;
    newEmailsFound: number;
    processedSuccessfully: number;
    errors: number;
    duration: number;
  }): Promise<void> {
    const type =
      stats.errors > 0 ? NotificationType.WARNING : NotificationType.INFO;

    await this.sendNotification(
      type,
      "Relatório do Ciclo de Monitoramento",
      `Ciclo de verificação de e-mails concluído`,
      {
        "Contas Monitoradas": String(stats.totalEmails),
        "E-mails Novos": String(stats.newEmailsFound),
        "Processados com Sucesso": String(stats.processedSuccessfully),
        Erros: String(stats.errors),
        Duração: `${stats.duration}ms`,
        Timestamp: new Date().toLocaleString("pt-BR"),
      }
    );
  }

  /**
   * Notifica quando o sistema inicializa
   */
  async notifySystemStart(intervalMinutes: number): Promise<void> {
    await this.sendNotification(
      NotificationType.INFO,
      "Sistema Iniciado",
      `Monitoramento de e-mails iniciado com sucesso`,
      {
        Intervalo: `${intervalMinutes} minuto(s)`,
        Status: "Ativo",
        Timestamp: new Date().toLocaleString("pt-BR"),
      }
    );
  }

  /**
   * Notifica quando o sistema para
   */
  async notifySystemStop(): Promise<void> {
    await this.sendNotification(
      NotificationType.WARNING,
      "Sistema Parado",
      `Monitoramento de e-mails foi interrompido`,
      {
        Status: "Inativo",
        Timestamp: new Date().toLocaleString("pt-BR"),
      }
    );
  }

  /**
   * Envia mensagem customizada (para casos especiais)
   */
  async sendCustomMessage(content: string): Promise<void> {
    await this.sendToDiscord({ content });
  }
}

// Exporta uma instância singleton
export const discordNotification = new DiscordNotificationService();
