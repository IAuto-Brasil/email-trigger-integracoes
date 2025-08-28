import { ImapFlow, FetchMessageObject } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";

const activeConnections: { [email: string]: ImapFlow } = {};
const retryDelays: { [key: string]: number } = {};

export interface ParsedEmail {
  from: string | undefined;
  to: string | undefined;
  subject: string | undefined;
  text: string | null;
  html: string | false | null;
  attachments: {
    filename: string | undefined;
    contentType: string;
    size: number;
    content: Buffer;
  }[];
}

export async function monitorEmailAccount(
  email: string,
  password: string,
  onNewMail: (mail: ParsedEmail) => void
) {
  if (activeConnections[email]) {
    console.log(`⚠️ Conta ${email} já está sendo monitorada.`);
    return;
  }

  const client = new ImapFlow({
    host: "mail.iautobrasil.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: password,
    },
    logger: false,
  });

  const reconnect = () => {
    delete activeConnections[email];
    const delay = retryDelays[email] || 2000; // começa em 2s
    console.log(`🔄 Tentando reconectar ${email} em ${delay / 1000}s...`);

    setTimeout(() => {
      retryDelays[email] = Math.min(delay * 2, 60000); // aumenta até 60s máx
      monitorEmailAccount(email, password, onNewMail).catch((err) =>
        console.error(`❌ Falha na reconexão de ${email}:`, err.message)
      );
    }, delay);
  };

  client.on("error", (err) => {
    console.error(`❌ Erro na conta ${email}:`, err.message);
    reconnect();
  });

  client.on("close", () => {
    console.log(`📪 Conexão fechada para ${email}`);
    reconnect();
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    console.log(`✅ Monitorando ${email} com sucesso!`);

    activeConnections[email] = client;
    retryDelays[email] = 2000;

    // Mantém sessão viva com NOOP
    setInterval(async () => {
      try {
        if (client.usable) {
          await client.noop();
          console.log(`🔄 Mantendo sessão ativa de ${email}`);
        }
      } catch (err) {
        console.error(`⚠️ Falha no NOOP de ${email}:`, (err as Error).message);
      }
    }, 5 * 60 * 1000); // a cada 5 min

    // Monitora novos emails
    client.on("exists", async () => {
      if (!client.mailbox) return;

      const seq = client.mailbox.exists; // Último número de mensagem
      const lock = await client.getMailboxLock("INBOX");

      try {
        const message = (await client.fetchOne(seq, {
          envelope: true,
          source: true,
        })) as FetchMessageObject | null;

        if (message && message.source) {
          const parsed: ParsedMail = await simpleParser(message.source);

          const structured: ParsedEmail = {
            from: parsed.from?.text,
            to: Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text,
            subject: parsed.subject,
            text: parsed.text ?? null,
            html: parsed.html,
            attachments: (parsed.attachments || []).map((att) => ({
              filename: att.filename,
              contentType: att.contentType,
              size: att.size,
              content: att.content as Buffer,
            })),
          };

          if (structured.html) {
            structured.html = structured.html.toString();
          }

          // Chama o callback passando o JSON estruturado
          onNewMail(structured);
        }
      } catch (err) {
        console.error(`Erro ao processar mensagem em ${email}:`, err);
      } finally {
        lock.release();
      }
    });

    activeConnections[email] = client;
  } catch (error) {
    console.error(`❌ Erro ao conectar em ${email}:`, error);
    throw error;
  }
}

/**
 * Para o monitoramento de uma conta específica
 */
export async function stopMonitoring(email: string): Promise<void> {
  const connection = activeConnections[email];

  if (connection) {
    try {
      await connection.logout();
      delete activeConnections[email];
      console.log(`🛑 Monitoramento parado para ${email}`);
    } catch (error) {
      console.error(`Erro ao parar monitoramento de ${email}:`, error);
      // Remove da lista mesmo se houver erro
      delete activeConnections[email];
    }
  }
}

/**
 * Para todos os monitoramentos ativos
 */
export async function stopAllMonitoring(): Promise<void> {
  const emails = Object.keys(activeConnections);

  for (const email of emails) {
    await stopMonitoring(email);
  }

  console.log("🛑 Todos os monitoramentos foram parados");
}

/**
 * Retorna a lista de emails sendo monitorados
 */
export function getActiveConnections(): string[] {
  return Object.keys(activeConnections);
}
