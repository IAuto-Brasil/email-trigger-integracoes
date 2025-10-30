import axios from "axios";
import { config } from "../config";
import { discordNotification } from "./discord-notification";

const { host, user, token, domain } = config.cpanel;

function getAuthHeader() {
  return { Authorization: `cpanel ${user}:${token}` };
}

/**
 * Cria uma nova conta de e-mail
 */

export async function createEmailAccount(
  companyId: string,
  password: string,
  quota: number = 250
) {
  try {
    const response = await axios.get(`${host}/execute/Email/add_pop`, {
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
      // NOTIFICAÇÃO DE ERRO
      await discordNotification.notifyCpanelError(
        "Criar E-mail",
        companyId,
        response.data.errors
      );

      throw new Error(
        `Erro do cPanel: ${JSON.stringify(response.data.errors)}`
      );
    }

    return {
      ...response.data,
      email: `${companyId}@${domain}`,
    };
  } catch (error) {
    console.error(
      `Erro ao criar conta de email ${companyId}@${domain}:`,
      error
    );

    // NOTIFICAÇÃO DE ERRO
    await discordNotification.notifyCpanelError(
      "Criar E-mail",
      companyId,
      error
    );

    throw error;
  }
}

/**
 * Lista todas as contas de e-mail do domínio
 */
export async function listEmails() {
  try {
    const response = await axios.get(`${host}/execute/Email/list_pops`, {
      headers: getAuthHeader(),
      params: { domain },
      timeout: 30000,
    });

    return response.data;
  } catch (error) {
    console.error("Erro ao listar emails:", error);
    throw error;
  }
}

/**
 * Deleta uma conta de email
 */
export async function deleteEmailAccount(email: string) {
  try {
    const response = await axios.get(`${host}/execute/Email/delete_pop`, {
      headers: getAuthHeader(),
      params: {
        email: `${email}@${domain}`,
      },
      timeout: 30000,
    });

    if (response.data?.errors && response.data.errors.length > 0) {
      throw new Error(
        `Erro do cPanel: ${JSON.stringify(response.data.errors)}`
      );
    }

    return response.data;
  } catch (error) {
    console.error(`Erro ao deletar conta de email ${email}@${domain}:`, error);
    throw error;
  }
}
