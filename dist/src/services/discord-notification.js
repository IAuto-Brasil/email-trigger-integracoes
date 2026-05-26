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
const FOOTER = "Sistema de Monitoramento de E-mail · IAuto Brasil";
const AUTHOR = "Email Trigger Integrações";
const FIELD_VALUE_MAX = 1024;
const FIELD_NAME_MAX = 256;
const MAX_FIELDS = 25;
function truncate(text, max = FIELD_VALUE_MAX) {
    const s = text.trim() || "—";
    if (s.length <= max)
        return s;
    return `${s.slice(0, max - 1)}…`;
}
function formatTs(date = new Date()) {
    return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function companyIdFromEmail(email) {
    const local = email.split("@")[0]?.trim();
    return local || "—";
}
function formatUnknownError(error) {
    if (error == null)
        return { message: "Erro desconhecido" };
    if (typeof error === "string")
        return { message: error };
    const e = error;
    return {
        message: e.message || String(error),
        code: e.code,
        stack: e.stack,
        authFailed: e.authenticationFailed,
        response: typeof e.response === "string" ? e.response : undefined,
    };
}
function leadFields(lead) {
    if (!lead)
        return [];
    return [
        field("Lead", lead.leadName),
        field("E-mail do lead", lead.leadEmail || "—"),
        field("Telefone", lead.leadPhone || "—"),
        field("Portal", lead.portal),
        field("Veículo", lead.vehicle || "—"),
        field("Valor", lead.valueRaw || lead.value || "—"),
        field("De (portal)", lead.from),
        field("Para (loja)", lead.to),
        field("Empresa", companyIdFromEmail(lead.to || "")),
    ];
}
function field(name, value, inline = true) {
    const str = truncate(String(value ?? "—"));
    const useInline = inline && str.length <= 40 && !name.toLowerCase().includes("erro");
    return {
        name: truncate(name, FIELD_NAME_MAX),
        value: str,
        inline: useInline,
    };
}
function fieldBlock(name, value) {
    return field(name, value, false);
}
function appendFields(target, ...items) {
    for (const item of items) {
        if (target.length >= MAX_FIELDS)
            return;
        target.push(item);
    }
}
class DiscordNotificationService {
    async sendToDiscord(message) {
        const url = config_1.config.discordWebhookUrl?.trim();
        if (!url)
            return;
        try {
            await axios_1.default.post(url, message, {
                headers: { "Content-Type": "application/json" },
                timeout: 10000,
            });
        }
        catch (error) {
            console.error("Falha ao enviar notificação para Discord:", error);
        }
    }
    baseEmbed(type, title, description) {
        return {
            title: `${this.getEmojiByType(type)} ${title}`,
            description: truncate(description, 4096),
            color: this.getColorByType(type),
            timestamp: new Date().toISOString(),
            author: { name: AUTHOR },
            footer: { text: FOOTER },
        };
    }
    getColorByType(type) {
        const colors = {
            [NotificationType.ERROR]: 0xed4245,
            [NotificationType.WARNING]: 0xfaa61a,
            [NotificationType.INFO]: 0x5865f2,
            [NotificationType.SUCCESS]: 0x57f287,
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
    fieldsFromRecord(details) {
        return Object.entries(details).map(([key, value]) => {
            const str = truncate(String(value ?? "—"));
            const inline = str.length <= 40 &&
                !/erro|resposta|stack|mensagem|detalhe/i.test(key);
            return {
                name: truncate(key, FIELD_NAME_MAX),
                value: str,
                inline,
            };
        });
    }
    async sendNotification(type, title, message, details) {
        const embed = this.baseEmbed(type, title, message);
        if (details) {
            embed.fields = this.fieldsFromRecord({
                ...details,
                "Horário (BR)": formatTs(),
            });
        }
        else {
            embed.fields = [field("Horário (BR)", formatTs())];
        }
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifyCpanelError(operation, companyId, error) {
        const err = formatUnknownError(error);
        const cpanelErrors = error &&
            typeof error === "object" &&
            Array.isArray(error.errors)
            ? JSON.stringify(error.errors)
            : null;
        const fields = [
            field("Operação", operation, false),
            field("Empresa ID", companyId),
            field("Domínio", config_1.config.cpanel.domain),
            field("E-mail esperado", `${companyId}@${config_1.config.cpanel.domain}`),
            field("Host cPanel", truncate(config_1.config.cpanel.host, 80)),
            field("Código", err.code || "—"),
            fieldBlock("Mensagem", err.message),
        ];
        if (cpanelErrors) {
            appendFields(fields, fieldBlock("Erros cPanel (JSON)", cpanelErrors));
        }
        if (err.stack) {
            appendFields(fields, fieldBlock("Stack (trecho)", err.stack.split("\n").slice(0, 5).join("\n")));
        }
        appendFields(fields, field("Horário (BR)", formatTs()));
        const embed = this.baseEmbed(NotificationType.ERROR, "Erro no cPanel", `Não foi possível concluir **${operation}** para a empresa **${companyId}**.`);
        embed.fields = fields;
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifyEmailConnectionError(email, error) {
        const err = formatUnknownError(error);
        const isAuth = err.authFailed ||
            /auth|login|credential|invalid password/i.test(err.message);
        const fields = [
            field("Conta IMAP", email, false),
            field("Empresa", companyIdFromEmail(email)),
            field("Servidor", "mail.iautobrasil.com:993 (SSL)"),
            field("Tipo", isAuth ? "Autenticação" : "Conexão / rede"),
            field("Código", err.code || "—"),
            fieldBlock("Erro", err.message),
        ];
        if (isAuth) {
            appendFields(fields, fieldBlock("Como corrigir", "Confira DEFAULT_PWD no .env ou imapPassword no banco para esta conta. Senha no cPanel deve coincidir."));
        }
        else {
            appendFields(fields, fieldBlock("Como corrigir", "Falha transitória comum (Unexpected close). O sistema tentará de novo no próximo ciclo."));
        }
        if (err.response) {
            appendFields(fields, fieldBlock("Resposta IMAP", err.response));
        }
        appendFields(fields, field("Horário (BR)", formatTs()));
        const embed = this.baseEmbed(NotificationType.ERROR, "Erro de Conexão IMAP", isAuth
            ? `Falha de **autenticação** na conta **${email}**.`
            : `Falha ao conectar ou ler a caixa **${email}**.`);
        embed.fields = fields;
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifyEmailProcessingError(accountEmail, messageId, error, context) {
        const err = formatUnknownError(error);
        const fields = [
            field("Conta", accountEmail, false),
            field("Empresa", companyIdFromEmail(accountEmail)),
            field("UID IMAP", context?.uid ?? "—"),
            field("Assunto", context?.subject || "—"),
            field("Remetente", context?.from || "—"),
            field("Recebido em", context?.receivedAt ? formatTs(context.receivedAt) : "—"),
            fieldBlock("Message-ID", messageId),
            fieldBlock("Erro", err.message),
        ];
        if (error && typeof error === "object" && "response" in error) {
            const ax = error;
            if (ax.response?.status) {
                appendFields(fields, field("HTTP", String(ax.response.status)));
            }
            if (ax.response?.data) {
                appendFields(fields, fieldBlock("Resposta API", typeof ax.response.data === "string"
                    ? ax.response.data
                    : JSON.stringify(ax.response.data)));
            }
        }
        appendFields(fields, field("Horário (BR)", formatTs()));
        const embed = this.baseEmbed(NotificationType.ERROR, "Erro no Processamento de E-mail", `Lead não enviado — falha ao processar mensagem na conta **${accountEmail}**.`);
        embed.fields = fields;
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifyServerCommunicationError(leadData, error, companyId) {
        const errorDetails = this.extractAxiosErrorDetails(error);
        const fields = [
            field("Empresa", companyId || companyIdFromEmail(leadData?.to || "")),
            field("Status HTTP", errorDetails.status ?? "—"),
            field("Endpoint", truncate(config_1.config.receiveLeadUrl, 120), false),
            fieldBlock("Resumo", errorDetails.description),
            fieldBlock("Erro principal", errorDetails.mainError),
        ];
        appendFields(fields, ...leadFields(leadData));
        if (errorDetails.serverMessage) {
            appendFields(fields, fieldBlock("Mensagem do servidor", errorDetails.serverMessage));
        }
        if (errorDetails.whatsappError) {
            appendFields(fields, fieldBlock("WhatsApp", errorDetails.whatsappError));
        }
        if (errorDetails.evolutionError) {
            appendFields(fields, fieldBlock("Evolution API", errorDetails.evolutionError));
        }
        if (errorDetails.responseBody) {
            appendFields(fields, fieldBlock("Corpo da resposta", errorDetails.responseBody));
        }
        appendFields(fields, field("Horário (BR)", formatTs()));
        const embed = this.baseEmbed(NotificationType.ERROR, "Erro de Comunicação com Servidor", `Falha ao enviar lead **${leadData?.leadName || "—"}** para a API de recebimento.`);
        embed.fields = fields.slice(0, MAX_FIELDS);
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifyWhatsAppError(leadData, phoneNumber, evolutionError) {
        const fields = [
            fieldBlock("Situação", evolutionError),
            field("Telefone enviado", phoneNumber, false),
            field("Telefone original", leadData?.leadPhone || "—"),
            field("Ação", "Marcado como processado (evita loop)"),
        ];
        appendFields(fields, ...leadFields(leadData));
        appendFields(fields, field("Horário (BR)", formatTs()));
        const embed = this.baseEmbed(NotificationType.WARNING, "Problema com Número WhatsApp", `O número **${phoneNumber}** não foi aceito para o lead **${leadData?.leadName || "—"}**.`);
        embed.fields = fields.slice(0, MAX_FIELDS);
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifyHighValueLead(lead, accountEmail, normalizedPhone) {
        const fields = [
            field("Conta IMAP", accountEmail, false),
            field("Empresa", companyIdFromEmail(accountEmail)),
            field("Telefone (enviado)", normalizedPhone),
        ];
        appendFields(fields, ...leadFields(lead));
        appendFields(fields, field("Horário (BR)", formatTs()));
        const embed = this.baseEmbed(NotificationType.SUCCESS, "Lead de Alto Valor Processado", `Lead **${lead.leadName}** enviado com sucesso (valor acima do limite configurado).`);
        embed.fields = fields.slice(0, MAX_FIELDS);
        await this.sendToDiscord({ embeds: [embed] });
    }
    extractAxiosErrorDetails(error) {
        const err = formatUnknownError(error);
        const details = {
            mainError: err.message,
            description: "Falha ao enviar lead para IAuto Brasil",
        };
        if (error && typeof error === "object" && "response" in error) {
            const response = error
                .response;
            details.status = response.status;
            if (response.data != null) {
                details.responseBody =
                    typeof response.data === "string"
                        ? response.data
                        : JSON.stringify(response.data, null, 0);
                const serverData = response.data;
                if (serverData.message) {
                    details.serverMessage = serverData.message;
                    if (serverData.message.includes("WhatsApp")) {
                        details.description = "Erro no envio via WhatsApp";
                        const evolutionMatch = serverData.message.match(/Evolution: (.+)$/);
                        if (evolutionMatch) {
                            details.evolutionError = evolutionMatch[1];
                            try {
                                const evolutionJson = JSON.parse(evolutionMatch[1]
                                    .replace(/^\d+\s+\w+\s+\w+:\s+"/, "")
                                    .replace(/"$/, ""));
                                const messages = evolutionJson.response?.message;
                                if (Array.isArray(messages)) {
                                    details.whatsappError = messages
                                        .map((m) => `Número ${m.number}: ${m.exists ? "existe" : "não existe"} (JID: ${m.jid})`)
                                        .join("\n");
                                }
                            }
                            catch {
                                // mantém string original
                            }
                        }
                    }
                }
                if (serverData.value === "error") {
                    details.description = "Servidor retornou erro no payload";
                }
            }
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
    async notifyEmailCreated(companyId, email) {
        const embed = this.baseEmbed(NotificationType.SUCCESS, "E-mail Criado com Sucesso", `Conta **${email}** criada no cPanel e incluída no monitoramento.`);
        embed.fields = [
            field("Empresa ID", companyId),
            field("E-mail", email, false),
            field("Domínio", config_1.config.cpanel.domain),
            field("Monitoramento", "Ativo no próximo ciclo"),
            field("Senha IMAP", "DEFAULT_PWD (.env)"),
            field("Horário (BR)", formatTs()),
        ];
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifyMonitoringStats(stats) {
        const type = stats.errors > stats.processedSuccessfully
            ? NotificationType.WARNING
            : stats.errors > 0
                ? NotificationType.INFO
                : NotificationType.SUCCESS;
        const rate = stats.newEmailsFound > 0
            ? Math.round((stats.processedSuccessfully / stats.newEmailsFound) * 100)
            : null;
        const embed = this.baseEmbed(type, "Relatório do Ciclo de Monitoramento", `Ciclo concluído em **${(stats.duration / 1000).toFixed(1)}s** · ${stats.totalEmails} conta(s) verificada(s).`);
        embed.fields = [
            field("Contas monitoradas", stats.totalEmails),
            field("E-mails novos", stats.newEmailsFound),
            field("Processados com sucesso", stats.processedSuccessfully),
            field("Erros (total)", stats.errors),
            field("Erros WhatsApp", stats.whatsappErrors ?? 0),
            field("Erros servidor/API", stats.serverErrors ?? 0),
            field("Taxa de sucesso", rate != null ? `${rate}%` : "N/A"),
            field("Duração", `${stats.duration} ms`),
            field("Horário (BR)", formatTs()),
        ];
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifyCriticalCycleError(error) {
        const err = formatUnknownError(error);
        const fields = [
            fieldBlock("Mensagem", err.message),
            field("Código", err.code || "—"),
        ];
        if (err.stack) {
            appendFields(fields, fieldBlock("Stack (trecho)", err.stack.split("\n").slice(0, 8).join("\n")));
        }
        appendFields(fields, field("Horário (BR)", formatTs()));
        const embed = this.baseEmbed(NotificationType.ERROR, "Erro Crítico no Ciclo", "Falha geral no ciclo de monitoramento — o agendamento **continua** na próxima janela.");
        embed.fields = fields;
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifySystemStart(intervalMinutes) {
        const embed = this.baseEmbed(NotificationType.INFO, "Sistema Iniciado", "Monitoramento IMAP e API de leads **ativo**.");
        embed.fields = [
            field("Intervalo do ciclo", `${intervalMinutes} min`),
            field("Porta HTTP", config_1.config.server.port),
            field("Timeout IMAP/conta", `${Math.round(config_1.config.monitoring.perAccountImapTimeoutMs / 60000)} min`),
            field("Ambiente", process.env.NODE_ENV || "development"),
            field("Discord", config_1.config.discordWebhookUrl ? "Configurado" : "Desativado"),
            field("Horário (BR)", formatTs()),
        ];
        await this.sendToDiscord({ embeds: [embed] });
    }
    async notifySystemStop() {
        const embed = this.baseEmbed(NotificationType.WARNING, "Sistema Parado", "Monitoramento de e-mails **interrompido** (SIGINT/SIGTERM ou parada manual).");
        embed.fields = [
            field("Status", "Inativo"),
            field("Horário (BR)", formatTs()),
        ];
        await this.sendToDiscord({ embeds: [embed] });
    }
    async sendCustomMessage(content) {
        await this.sendToDiscord({ content });
    }
}
exports.discordNotification = new DiscordNotificationService();
//# sourceMappingURL=discord-notification.js.map