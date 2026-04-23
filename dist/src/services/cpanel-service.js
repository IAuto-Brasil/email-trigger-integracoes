"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmailAccount = createEmailAccount;
exports.listEmails = listEmails;
exports.resolveCpanelMailbox = resolveCpanelMailbox;
exports.deleteEmailAccount = deleteEmailAccount;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const discord_notification_1 = require("./discord-notification");
const { host, user, token, domain } = config_1.config.cpanel;
function getAuthHeader() {
    return { Authorization: `cpanel ${user}:${token}` };
}
/**
 * Cria uma nova conta de e-mail
 */
async function createEmailAccount(companyId, password, quota = 250) {
    try {
        const response = await axios_1.default.get(`${host}/execute/Email/add_pop`, {
            headers: getAuthHeader(),
            params: {
                email: companyId,
                domain,
                password,
                quota,
            },
            timeout: 30000,
        });
        if (response.data?.errors && response.data.errors.length > 0) {
            await discord_notification_1.discordNotification.notifyCpanelError("Criar E-mail", companyId, response.data.errors);
            throw new Error(`Erro do cPanel: ${JSON.stringify(response.data.errors)}`);
        }
        return {
            ...response.data,
            email: `${companyId}@${domain}`,
        };
    }
    catch (error) {
        console.error(`Erro ao criar conta de email ${companyId}@${domain}:`, error);
        // NOTIFICAÇÃO DE ERRO
        await discord_notification_1.discordNotification.notifyCpanelError("Criar E-mail", companyId, error);
        throw error;
    }
}
/**
 * Lista todas as contas de e-mail do domínio
 */
async function listEmails() {
    try {
        const response = await axios_1.default.get(`${host}/execute/Email/list_pops`, {
            headers: getAuthHeader(),
            params: { domain },
            timeout: 30000,
        });
        return response.data;
    }
    catch (error) {
        console.error("Erro ao listar emails:", error);
        throw error;
    }
}
/** Retorna o endereço completo user@domain para a API cPanel (aceita só o usuário ou e-mail completo). */
function resolveCpanelMailbox(emailOrLocal) {
    const d = domain.toLowerCase();
    if (emailOrLocal.includes("@")) {
        return emailOrLocal.trim();
    }
    return `${emailOrLocal.trim()}@${d}`;
}
/**
 * Deleta uma conta de email (local ou endereço completo)
 */
async function deleteEmailAccount(email) {
    const mailbox = resolveCpanelMailbox(email);
    try {
        const response = await axios_1.default.get(`${host}/execute/Email/delete_pop`, {
            headers: getAuthHeader(),
            params: {
                email: mailbox,
            },
            timeout: 30000,
        });
        if (response.data?.errors && response.data.errors.length > 0) {
            throw new Error(`Erro do cPanel: ${JSON.stringify(response.data.errors)}`);
        }
        return response.data;
    }
    catch (error) {
        console.error(`Erro ao deletar conta de email ${mailbox}:`, error);
        throw error;
    }
}
//# sourceMappingURL=cpanel-service.js.map