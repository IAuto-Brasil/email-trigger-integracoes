import { ImapFlow, FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "../../prisma";
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

export async function monitorEmailAccountRefactor(
  email: string,
  password: string,
  onNewMail: (mail: ParsedEmail) => void
) {
  let client: ImapFlow | null = null;

  try {
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

    await client.connect();
    await client.mailboxOpen("INBOX");

    // Busca emails das últimas 24 horas
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const messages = client.fetch(
      { since: twentyFourHoursAgo },
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
      `📨 ${email}: Encontrados ${allEmails.length} emails na última hora`
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

    // Filtra apenas emails não processados
    const newEmails = allEmails.filter(
      (email) =>
        !processedMessageIds.has(email.messageId) &&
        !processedUIDs.has(email.uid)
    );

    console.log(`🆕 ${email}: ${newEmails.length} emails novos para processar`);

    // Processa apenas emails novos
    for (const emailData of newEmails) {
      try {
        // Chama o callback com o email
        await onNewMail(emailData);

        // Salva no banco que foi processado
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

        await discordNotification.notifyEmailProcessingError(
          email,
          emailData.messageId,
          error
        );
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao conectar ${email}:`, error);
    await discordNotification.notifyEmailConnectionError(email, error);
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
  const parsed = await simpleParser(msg.source!);

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
