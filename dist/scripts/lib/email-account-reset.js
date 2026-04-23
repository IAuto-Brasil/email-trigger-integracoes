"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeFromDatabase = removeFromDatabase;
exports.removeAllDbRowsForCompany = removeAllDbRowsForCompany;
exports.recreateEmailAccount = recreateEmailAccount;
/**
 * Lógica compartilhada: apagar conta no cPanel + BD e recriar com senha padrão.
 */
const prisma_1 = require("../../prisma");
const config_1 = require("../../src/config");
const cpanel_service_1 = require("../../src/services/cpanel-service");
async function removeFromDatabase(accountEmail, emailId) {
    const processed = await prisma_1.prisma.processedEmail.findMany({
        where: { accountEmail },
        select: { messageId: true },
    });
    const messageIds = processed.map((p) => p.messageId).filter(Boolean);
    await prisma_1.prisma.$transaction(async (tx) => {
        if (messageIds.length > 0) {
            await tx.parsedEmailCache.deleteMany({
                where: { messageId: { in: messageIds } },
            });
        }
        await tx.processedEmail.deleteMany({ where: { accountEmail } });
        await tx.email.delete({ where: { id: emailId } });
    });
}
async function removeAllDbRowsForCompany(companyId, fullEmail) {
    const rows = await prisma_1.prisma.email.findMany({
        where: {
            OR: [{ companyId }, { email: fullEmail }],
        },
    });
    for (const row of rows) {
        await removeFromDatabase(row.email, row.id);
    }
    return rows.length;
}
function errMsg(e) {
    if (e instanceof Error)
        return e.message;
    return String(e);
}
/**
 * Remove a conta no cPanel (se existir), limpa dados no PostgreSQL e recria
 * mailbox + linha em `emails` com imapPassword nulo (usa DEFAULT_PWD no IMAP).
 */
async function recreateEmailAccount(companyId, password) {
    const domain = config_1.config.cpanel.domain;
    const fullEmail = `${companyId}@${domain}`;
    console.log(`\n── ${fullEmail} ──`);
    try {
        await (0, cpanel_service_1.deleteEmailAccount)(companyId);
        console.log("  cPanel: delete OK");
    }
    catch (e) {
        console.log("  cPanel: delete (avisou — pode ser conta inexistente):", errMsg(e));
    }
    const removed = await removeAllDbRowsForCompany(companyId, fullEmail);
    console.log(`  BD: ${removed} registro(s) em emails removido(s)`);
    await new Promise((r) => setTimeout(r, 400));
    await (0, cpanel_service_1.createEmailAccount)(companyId, password);
    console.log("  cPanel: conta criada com DEFAULT_PWD");
    await prisma_1.prisma.email.create({
        data: {
            email: fullEmail,
            companyId,
            isActive: true,
            imapPassword: null,
        },
    });
    console.log("  BD: registro criado (imapPassword vazio → usa DEFAULT_PWD)");
}
//# sourceMappingURL=email-account-reset.js.map