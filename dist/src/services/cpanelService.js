"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmailAccount = createEmailAccount;
exports.createForwarder = createForwarder;
exports.listEmails = listEmails;
exports.deleteEmailAccount = deleteEmailAccount;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const { host, user, token, domain } = config_1.config.cpanel;
function getAuthHeader() {
    return { Authorization: `cpanel ${user}:${token}` };
}
/**
 * Cria uma nova conta de e-mail
 */
async function createEmailAccount(companyId, password, quota = 250) {
    try {
        // O novo email terá o seguinte formato: {companyId}@{domain}
        const response = await axios_1.default.get(`${host}/execute/Email/add_pop`, {
            headers: getAuthHeader(),
            params: {
                email: companyId, // Nome do usuário (parte antes do @)
                domain,
                password,
                quota,
            },
            timeout: 30000, // 30 segundos de timeout
        });
        if (response.data?.errors && response.data.errors.length > 0) {
            throw new Error(`Erro do cPanel: ${JSON.stringify(response.data.errors)}`);
        }
        // Retorna o email criado no formato padrão
        return {
            ...response.data,
            email: `${companyId}@${domain}`,
        };
    }
    catch (error) {
        console.error(`Erro ao criar conta de email ${companyId}@${domain}:`, error);
        throw error;
    }
}
/**
 * Cria um forwarder para redirecionar os e-mails
 */
async function createForwarder(email, forwardTo) {
    try {
        const response = await axios_1.default.get(`${host}/execute/Email/add_forwarder`, {
            headers: getAuthHeader(),
            params: {
                email: `${email}@${domain}`,
                fwdopt: "fwd",
                fwdemail: forwardTo,
            },
            timeout: 30000,
        });
        if (response.data?.errors && response.data.errors.length > 0) {
            throw new Error(`Erro do cPanel: ${JSON.stringify(response.data.errors)}`);
        }
        return response.data;
    }
    catch (error) {
        console.error(`Erro ao criar forwarder ${email}@${domain} -> ${forwardTo}:`, error);
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
/**
 * Deleta uma conta de email
 */
async function deleteEmailAccount(email) {
    try {
        const response = await axios_1.default.get(`${host}/execute/Email/delete_pop`, {
            headers: getAuthHeader(),
            params: {
                email: `${email}@${domain}`,
            },
            timeout: 30000,
        });
        if (response.data?.errors && response.data.errors.length > 0) {
            throw new Error(`Erro do cPanel: ${JSON.stringify(response.data.errors)}`);
        }
        return response.data;
    }
    catch (error) {
        console.error(`Erro ao deletar conta de email ${email}@${domain}:`, error);
        throw error;
    }
}
//# sourceMappingURL=cpanelService.js.map