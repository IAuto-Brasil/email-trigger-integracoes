"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorEmailAccount = monitorEmailAccount;
exports.stopMonitoring = stopMonitoring;
exports.stopAllMonitoring = stopAllMonitoring;
exports.getActiveConnections = getActiveConnections;
const imapflow_1 = require("imapflow");
const mailparser_1 = require("mailparser");
const activeConnections = {};
const retryDelays = {};
async function monitorEmailAccount(email, password, onNewMail) {
    if (activeConnections[email]) {
        console.log(`⚠️ Conta ${email} já está sendo monitorada.`);
        return;
    }
    const client = new imapflow_1.ImapFlow({
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
            monitorEmailAccount(email, password, onNewMail).catch((err) => console.error(`❌ Falha na reconexão de ${email}:`, err.message));
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
        activeConnections[email] = client;
        retryDelays[email] = 2000;
        // Mantém sessão viva com NOOP
        setInterval(async () => {
            try {
                if (client.usable) {
                    await client.noop();
                    console.log(`🔄 Mantendo sessão ativa de ${email}`);
                }
            }
            catch (err) {
                console.error(`⚠️ Falha no NOOP de ${email}:`, err.message);
            }
        }, 5 * 60 * 1000); // a cada 5 min
        // Monitora novos emails
        client.on("exists", async () => {
            if (!client.mailbox)
                return;
            const seq = client.mailbox.exists; // Último número de mensagem
            const lock = await client.getMailboxLock("INBOX");
            try {
                const message = (await client.fetchOne(seq, {
                    envelope: true,
                    source: true,
                }));
                if (message && message.source) {
                    const parsed = await (0, mailparser_1.simpleParser)(message.source);
                    const structured = {
                        from: parsed.from?.text,
                        to: Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text,
                        subject: parsed.subject,
                        text: parsed.text ?? null,
                        html: parsed.html,
                        attachments: (parsed.attachments || []).map((att) => ({
                            filename: att.filename,
                            contentType: att.contentType,
                            size: att.size,
                            content: att.content,
                        })),
                    };
                    if (structured.html) {
                        structured.html = structured.html.toString();
                    }
                    // Chama o callback passando o JSON estruturado
                    onNewMail(structured);
                }
            }
            catch (err) {
                console.error(`Erro ao processar mensagem em ${email}:`, err);
            }
            finally {
                lock.release();
            }
        });
        activeConnections[email] = client;
    }
    catch (error) {
        console.error(`❌ Erro ao conectar em ${email}:`, error);
        throw error;
    }
}
/**
 * Para o monitoramento de uma conta específica
 */
async function stopMonitoring(email) {
    const connection = activeConnections[email];
    if (connection) {
        try {
            await connection.logout();
            delete activeConnections[email];
            console.log(`🛑 Monitoramento parado para ${email}`);
        }
        catch (error) {
            console.error(`Erro ao parar monitoramento de ${email}:`, error);
            // Remove da lista mesmo se houver erro
            delete activeConnections[email];
        }
    }
}
/**
 * Para todos os monitoramentos ativos
 */
async function stopAllMonitoring() {
    const emails = Object.keys(activeConnections);
    for (const email of emails) {
        await stopMonitoring(email);
    }
    console.log("🛑 Todos os monitoramentos foram parados");
}
/**
 * Retorna a lista de emails sendo monitorados
 */
function getActiveConnections() {
    return Object.keys(activeConnections);
}
//# sourceMappingURL=emailMonitor.js.map