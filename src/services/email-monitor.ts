// arquivo: monitorEmailAccountRefactor

import { ImapFlow, FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "../../prisma";
import { config } from "../config";
import { isTransientImapError } from "../utils/imap-transient";
import { sleep } from "../utils/sleep";
import { discordNotification } from "./discord-notification";

export interface ParsedEmail {
  messageId: string;
  uid: number;
  from: string | undefined;
  to: string | undefined;
  subject: string | undefined;
  text: string | null;
  html: string | false | null;
  receivedAt: Date;
  attachments: {
    filename: string | undefined;
    contentType: string;
    size: number;
    content: Buffer;
  }[];
}

const FAILURE_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutos
const recentFailures = new Map<string, number>();

function connectRetryable(
  err: unknown,
  isLast: boolean
): boolean {
  if (isLast) return false;
  if ((err as { authenticationFailed?: boolean })?.authenticationFailed) {
    return false;
  }
  return isTransientImapError(err);
}

async function safeNotifyConnectionError(
  email: string,
  error: unknown
): Promise<void> {
  try {
    await discordNotification.notifyEmailConnectionError(email, error);
  } catch (notifyErr) {
    console.error("❌ Falha ao notificar Discord (IMAP):", notifyErr);
  }
}

async function safeNotifyProcessingError(
  accountEmail: string,
  messageId: string,
  error: unknown,
  context?: {
    subject?: string | null;
    from?: string | null;
    uid?: number;
    receivedAt?: Date;
  }
): Promise<void> {
  try {
    await discordNotification.notifyEmailProcessingError(
      accountEmail,
      messageId,
      error,
      context
    );
  } catch (notifyErr) {
    console.error("❌ Falha ao notificar Discord (processamento e-mail):", notifyErr);
  }
}

export async function monitorEmailAccountRefactor(
  email: string,
  password: string,
  onNewMail: (mail: ParsedEmail) => void | Promise<void>
) {
  let client: ImapFlow | null = null;

  try {
    for (
      let attempt = 0;
      attempt < config.monitoring.imapConnectMaxAttempts;
      attempt++
    ) {
      if (client) {
        try {
          await client.logout();
        } catch {
          // ignore
        }
        client = null;
      }

      client = new ImapFlow({
        host: "mail.iautobrasil.com",
        port: 993,
        secure: true,
        auth: {
          user: email,
          pass: password,
        },
        logger: false,
        tls: {
          rejectUnauthorized: false,
        },
      });

      try {
        await client.connect();
        await client.mailboxOpen("INBOX");
        break;
      } catch (connectErr) {
        const isLast =
          attempt === config.monitoring.imapConnectMaxAttempts - 1;
        if (connectRetryable(connectErr, isLast)) {
          const delay = config.monitoring.imapConnectBaseDelayMs * Math.pow(2, attempt);
          console.warn(
            `⚠️ IMAP ${email} tentativa ${attempt + 1}/${
              config.monitoring.imapConnectMaxAttempts
            } falhou; nova tentativa em ${delay / 1000}s:`,
            connectErr
          );
          await sleep(delay);
          continue;
        }
        throw connectErr;
      }
    }

    if (!client) {
      return;
    }

    const fetchWindowDays = 7;
    const fetchWindowMs = fetchWindowDays * 24 * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() - fetchWindowMs);

    const messages = client.fetch(
      { since: windowStart },
      {
        envelope: true,
        source: true,
        uid: true,
      }
    );

    const allEmails: ParsedEmail[] = [];

    // Primeiro, coleta todos os emails
    for await (const msg of messages) {
      try {
        const parsedEmail = await parseMessage(msg);
        allEmails.push(parsedEmail);
      } catch (error) {
        console.error(
          `❌ Erro ao fazer parse da mensagem UID ${msg.uid}:`,
          error
        );
      }
    }

    console.log(
      `📨 ${email}: Encontrados ${allEmails.length} e-mail(s) na janela dos últimos ${fetchWindowDays} dias`
    );

    if (allEmails.length === 0) {
      return;
    }

    // Busca quais já foram processados
    const processedEmails = await prisma.processedEmail.findMany({
      where: {
        accountEmail: email,
        OR: [
          {
            messageId: {
              in: allEmails.map((e) => e.messageId).filter(Boolean),
            },
          },
          {
            uid: {
              in: allEmails.map((e) => e.uid),
            },
          },
        ],
      },
      select: {
        messageId: true,
        uid: true,
      },
    });

    // Cria um Set para busca rápida
    const processedMessageIds = new Set(
      processedEmails.map((e) => e.messageId)
    );
    const processedUIDs = new Set(processedEmails.map((e) => e.uid));

    // Filtra apenas emails não processados e fora do cooldown de falha recente
    const newEmails = allEmails.filter((mail) => {
      const hasBeenProcessed =
        processedMessageIds.has(mail.messageId) || processedUIDs.has(mail.uid);
      const lastFailAt = recentFailures.get(mail.messageId);
      const withinCooldown = lastFailAt
        ? Date.now() - lastFailAt < FAILURE_COOLDOWN_MS
        : false;

      return !hasBeenProcessed && !withinCooldown;
    });

    console.log(`🆕 ${email}: ${newEmails.length} emails novos para processar`);

    // Diagnóstico: quando há emails encontrados mas nenhum elegível para processamento,
    // logamos o motivo de cada um (processado vs cooldown)
    if (allEmails.length > 0 && newEmails.length === 0) {
      for (const mail of allEmails) {
        const processed =
          processedMessageIds.has(mail.messageId) ||
          processedUIDs.has(mail.uid);
        const lastFailAt = recentFailures.get(mail.messageId);
        const withinCooldown = lastFailAt
          ? Date.now() - lastFailAt < FAILURE_COOLDOWN_MS
          : false;

        if (processed) {
          console.log(
            `↪️ ${email}: ${mail.messageId} (UID ${mail.uid}) ignorado: já processado`
          );
        } else if (withinCooldown && lastFailAt) {
          const nextTryAt = new Date(
            lastFailAt + FAILURE_COOLDOWN_MS
          ).toLocaleTimeString();
          console.log(
            `↪️ ${email}: ${mail.messageId} (UID ${mail.uid}) ignorado: em cooldown até ${nextTryAt}`
          );
        } else {
          console.log(
            `➡️ ${email}: ${mail.messageId} (UID ${mail.uid}) elegível, porém não selecionado (verificar lógica)`
          );
        }
      }
    }

    for (const emailData of newEmails) {
      try {
        // Chama o callback com o email
        await onNewMail(emailData);

        // Só salva no banco como processado se não houve erro
        await prisma.processedEmail.create({
          data: {
            messageId: emailData.messageId,
            uid: emailData.uid,
            accountEmail: email,
            fromEmail: emailData.from,
            toEmail: emailData.to,
            subject: emailData.subject,
            receivedAt: emailData.receivedAt,
          },
        });

        console.log(`✅ Email processado e salvo: ${emailData.messageId}`);
      } catch (error) {
        console.error(
          `❌ Erro ao processar email ${emailData.messageId}:`,
          error
        );

        // Marca falha recente para aplicar cooldown
        recentFailures.set(emailData.messageId, Date.now());
        console.log(
          `⏳ Cooldown aplicado para ${emailData.messageId} por ${
            FAILURE_COOLDOWN_MS / (60 * 1000)
          } minutos`
        );

        await safeNotifyProcessingError(
          email,
          emailData.messageId,
          error,
          {
            subject: emailData.subject,
            from: emailData.from,
            uid: emailData.uid,
            receivedAt: emailData.receivedAt,
          }
        );
      }
    }
  } catch (error: unknown) {
    const err = error as {
      authenticationFailed?: boolean;
      message?: string;
      response?: string;
    };
    if (err?.authenticationFailed) {
      console.error(
        `❌ IMAP autenticação falhou: ${email}\n` +
          `   → Senha incorreta ou conta bloqueada. O app usa DEFAULT_PWD do .env para todas as contas, ` +
          `a menos que exista imapPassword no banco (tabela emails) para este endereço.\n` +
          `   → Corrija: alinhe a senha no cPanel com DEFAULT_PWD, ou defina imapPassword só para esta conta.`
      );
    } else {
      console.error(`❌ Erro ao conectar ${email}:`, error);
    }
    await safeNotifyConnectionError(email, error);
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch (error) {
        // Ignora erros de logout
      }
    }
  }
}

async function parseMessage(msg: FetchMessageObject): Promise<ParsedEmail> {
  if (!msg.source || msg.source.length === 0) {
    throw new Error(`UID ${msg.uid}: mensagem sem corpo (source vazio)`);
  }
  const parsed = await simpleParser(msg.source);

  // Gera um messageId único se não existir
  const messageId = parsed.messageId || `${msg.uid}-${Date.now()}`;

  return {
    messageId,
    uid: msg.uid,
    from: parsed.from?.text,
    to: Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text,
    subject: parsed.subject,
    text: parsed.text ?? null,
    html: parsed.html,
    receivedAt: parsed.date || new Date(),
    attachments: parsed.attachments.map((att) => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      content: att.content as Buffer,
    })),
  };
}

// Função para limpar emails antigos do banco (opcional)
export async function cleanupOldProcessedEmails(daysToKeep: number = 30) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  const deleted = await prisma.processedEmail.deleteMany({
    where: {
      processedAt: {
        lt: cutoffDate,
      },
    },
  });

  console.log(
    `🧹 Removidos ${deleted.count} registros de emails antigos (mais de ${daysToKeep} dias)`
  );
  return deleted.count;
}

// Função para obter estatísticas
export async function getProcessingStats(email?: string) {
  const where = email ? { accountEmail: email } : {};

  const stats = await prisma.processedEmail.aggregate({
    where,
    _count: { id: true },
    _min: { processedAt: true },
    _max: { processedAt: true },
  });

  return {
    totalProcessed: stats._count.id,
    firstProcessed: stats._min.processedAt,
    lastProcessed: stats._max.processedAt,
  };
}
