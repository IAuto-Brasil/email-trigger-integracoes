"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discordNotification = exports.NotificationType = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
var NotificationType;
(function (NotificationType) {
    NotificationType["ERROR"] = "error";
    NotificationType["WARNING"] = "warning";
    NotificationType["INFO"] = "info";
    NotificationType["SUCCESS"] = "success";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
class DiscordNotificationService {
    async sendToDiscord(message) {
        const url = config_1.config.discordWebhookUrl?.trim();
        if (!url) {
            return;
        }
        try {
            await axios_1.default.post(url, message, {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 10000, // 10 segundos
            });
        }
        catch (error) {
            // Evita loop infinito de notificações de erro
            console.error("Falha ao enviar notificação para Discord:", error);
        }
    }
    getColorByType(type) {
        const colors = {
            [NotificationType.ERROR]: 0xff0000, // Vermelho
            [NotificationType.WARNING]: 0xffa500, // Laranja
            [NotificationType.INFO]: 0x0099ff, // Azul
            [NotificationType.SUCCESS]: 0x00ff00, // Verde
        };
        return colors[type];
    }
    getEmojiByType(type) {
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
    async sendNotification(type, title, message, details) {
        const emoji = this.getEmojiByType(type);
        const color = this.getColorByType(type);
        const embed = {
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
    async notifyCpanelError(operation, companyId, error) {
        await this.sendNotification(NotificationType.ERROR, "Erro no cPanel", `Falha na operação: ${operation}`, {
            "Empresa ID": companyId,
            Erro: error?.message || String(error),
            Timestamp: new Date().toLocaleString("pt-BR"),
        });
    }
    /**
     * Notifica erro de conexão de e-mail
     */
    async notifyEmailConnectionError(email, error) {
        await this.sendNotification(NotificationType.ERROR, "Erro de Conexão IMAP", `Falha ao conectar com a conta de e-mail`, {
            "E-mail": email,
            Erro: error?.message || String(error),
            Timestamp: new Date().toLocaleString("pt-BR"),
        });
    }
    /**
     * Notifica erro no processamento de e-mail
     */
    async notifyEmailProcessingError(email, messageId, error) {
        await this.sendNotification(NotificationType.ERROR, "Erro no Processamento de E-mail", `Falha ao processar mensagem recebida`, {
            Conta: email,
            "Message ID": messageId,
            Erro: error?.message || String(error),
            Timestamp: new Date().toLocaleString("pt-BR"),
        });
    }
    /**
     * Notifica erro na comunicação com servidor
     */
    async notifyServerCommunicationError(leadData, error, companyId) {
        // Extrai informações detalhadas do erro Axios
        const errorDetails = this.extractAxiosErrorDetails(error);
        const fields = {
            Lead: leadData?.leadName || "N/A",
            "E-mail Lead": leadData?.leadEmail || "N/A",
            Telefone: leadData?.leadPhone || "N/A",
            Portal: leadData?.portal || "N/A",
            Veículo: leadData?.vehicle || "N/A",
            Valor: leadData?.valueRaw || leadData?.value || "N/A",
            "Status HTTP": errorDetails.status || "N/A",
            "Erro Principal": errorDetails.mainError,
            Timestamp: new Date().toLocaleString("pt-BR"),
            Empresa: companyId || "N/A",
        };
        // Adiciona detalhes específicos se disponíveis
        if (errorDetails.serverMessage) {
            fields["Resposta do Servidor"] = errorDetails.serverMessage;
        }
        if (errorDetails.whatsappError) {
            fields["Erro WhatsApp"] = errorDetails.whatsappError;
        }
        if (errorDetails.evolutionError) {
            fields["Detalhes Evolution"] = errorDetails.evolutionError;
        }
        await this.sendNotification(NotificationType.ERROR, "Erro de Comunicação com Servidor", errorDetails.description, fields);
    }
    /**
     * Notifica problemas específicos do WhatsApp/Evolution
     */
    async notifyWhatsAppError(leadData, phoneNumber, evolutionError) {
        await this.sendNotification(NotificationType.WARNING, "Problema com Número WhatsApp", `Número ${phoneNumber} não foi aceito pelo WhatsApp`, {
            Lead: leadData?.leadName || "N/A",
            "E-mail Lead": leadData?.leadEmail || "N/A",
            "Telefone Original": leadData?.leadPhone || "N/A",
            "Telefone Processado": phoneNumber,
            Portal: leadData?.portal || "N/A",
            "Erro Evolution": evolutionError,
            Status: "Número não existe no WhatsApp",
            Timestamp: new Date().toLocaleString("pt-BR"),
        });
    }
    /**
     * Extrai informações detalhadas de erros Axios
     */
    extractAxiosErrorDetails(error) {
        const details = {
            mainError: error?.message || String(error),
            description: "Falha ao enviar lead para IAuto Brasil",
        };
        // Se for erro Axios
        if (error?.response) {
            const response = error.response;
            details.status = response.status;
            // Resposta do servidor
            if (response.data) {
                const serverData = response.data;
                if (serverData.message) {
                    details.serverMessage = serverData.message;
                    // Analisa mensagens específicas do WhatsApp/Evolution
                    if (serverData.message.includes("WhatsApp")) {
                        details.description = "Erro no envio via WhatsApp";
                        // Extrai detalhes do Evolution
                        const evolutionMatch = serverData.message.match(/Evolution: (.+)$/);
                        if (evolutionMatch) {
                            details.evolutionError = evolutionMatch[1];
                            // Tenta parsear JSON do erro da Evolution
                            try {
                                const evolutionJson = JSON.parse(evolutionMatch[1]
                                    .replace(/^\d+\s+\w+\s+\w+:\s+"/, "")
                                    .replace(/"$/, ""));
                                if (evolutionJson.response?.message) {
                                    const messages = evolutionJson.response.message;
                                    if (Array.isArray(messages)) {
                                        details.whatsappError = messages
                                            .map((m) => `Número ${m.number}: ${m.exists ? "existe" : "não existe"} (JID: ${m.jid})`)
                                            .join(", ");
                                    }
                                }
                            }
                            catch (e) {
                                // Se não conseguir parsear, mantém a string original
                            }
                        }
                    }
                }
                if (serverData.value === "error") {
                    details.description = "Servidor retornou erro";
                }
            }
            // Descrições baseadas no status HTTP
            switch (response.status) {
                case 400:
                    details.description = "Requisição inválida (400 Bad Request)";
                    break;
                case 401:
                    details.description = "Não autorizado (401 Unauthorized)";
                    break;
                case 403:
                    details.description = "Acesso negado (403 Forbidden)";
                    break;
                case 404:
                    details.description = "Endpoint não encontrado (404 Not Found)";
                    break;
                case 429:
                    details.description = "Muitas requisições (429 Rate Limited)";
                    break;
                case 500:
                    details.description = "Erro interno do servidor (500)";
                    break;
                case 502:
                    details.description = "Gateway inválido (502 Bad Gateway)";
                    break;
                case 503:
                    details.description = "Serviço indisponível (503)";
                    break;
            }
        }
        return details;
    }
    /**
     * Notifica sucesso na criação de e-mail
     */
    async notifyEmailCreated(companyId, email) {
        await this.sendNotification(NotificationType.SUCCESS, "E-mail Criado com Sucesso", `Nova conta de e-mail criada e monitoramento iniciado`, {
            "Empresa ID": companyId,
            "E-mail": email,
            Status: "Monitoramento ativo",
            Timestamp: new Date().toLocaleString("pt-BR"),
        });
    }
    /**
     * Notifica estatísticas do ciclo de monitoramento
     */
    async notifyMonitoringStats(stats) {
        const type = stats.errors > 0 ? NotificationType.WARNING : NotificationType.INFO;
        await this.sendNotification(type, "Relatório do Ciclo de Monitoramento", `Ciclo de verificação de e-mails concluído`, {
            "Contas Monitoradas": String(stats.totalEmails),
            "E-mails Novos": String(stats.newEmailsFound),
            "Processados com Sucesso": String(stats.processedSuccessfully),
            Erros: String(stats.errors),
            Duração: `${stats.duration}ms`,
            Timestamp: new Date().toLocaleString("pt-BR"),
        });
    }
    /**
     * Notifica quando o sistema inicializa
     */
    async notifySystemStart(intervalMinutes) {
        await this.sendNotification(NotificationType.INFO, "Sistema Iniciado", `Monitoramento de e-mails iniciado com sucesso`, {
            Intervalo: `${intervalMinutes} minuto(s)`,
            Status: "Ativo",
            Timestamp: new Date().toLocaleString("pt-BR"),
        });
    }
    /**
     * Notifica quando o sistema para
     */
    async notifySystemStop() {
        await this.sendNotification(NotificationType.WARNING, "Sistema Parado", `Monitoramento de e-mails foi interrompido`, {
            Status: "Inativo",
            Timestamp: new Date().toLocaleString("pt-BR"),
        });
    }
    /**
     * Envia mensagem customizada (para casos especiais)
     */
    async sendCustomMessage(content) {
        await this.sendToDiscord({ content });
    }
}
// Exporta uma instância singleton
exports.discordNotification = new DiscordNotificationService();
//# sourceMappingURL=discord-notification.js.map