/**
 * Lógica compartilhada: apagar conta no cPanel + BD e recriar com senha padrão.
 */
import { prisma } from "../../prisma";
import { config } from "../../src/config";
import {
  createEmailAccount,
  deleteEmailAccount,
} from "../../src/services/cpanel-service";

export async function removeFromDatabase(accountEmail: string, emailId: number) {
  const processed = await prisma.processedEmail.findMany({
    where: { accountEmail },
    select: { messageId: true },
  });
  const messageIds = processed.map((p) => p.messageId).filter(Boolean);

  await prisma.$transaction(async (tx) => {
    if (messageIds.length > 0) {
      await tx.parsedEmailCache.deleteMany({
        where: { messageId: { in: messageIds } },
      });
    }
    await tx.processedEmail.deleteMany({ where: { accountEmail } });
    await tx.email.delete({ where: { id: emailId } });
  });
}

export async function removeAllDbRowsForCompany(
  companyId: string,
  fullEmail: string
) {
  const rows = await prisma.email.findMany({
    where: {
      OR: [{ companyId }, { email: fullEmail }],
    },
  });
  for (const row of rows) {
    await removeFromDatabase(row.email, row.id);
  }
  return rows.length;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Remove a conta no cPanel (se existir), limpa dados no PostgreSQL e recria
 * mailbox + linha em `emails` com imapPassword nulo (usa DEFAULT_PWD no IMAP).
 */
export async function recreateEmailAccount(
  companyId: string,
  password: string
): Promise<void> {
  const domain = config.cpanel.domain;
  const fullEmail = `${companyId}@${domain}`;

  console.log(`\n── ${fullEmail} ──`);

  try {
    await deleteEmailAccount(companyId);
    console.log("  cPanel: delete OK");
  } catch (e) {
    console.log(
      "  cPanel: delete (avisou — pode ser conta inexistente):",
      errMsg(e)
    );
  }

  const removed = await removeAllDbRowsForCompany(companyId, fullEmail);
  console.log(`  BD: ${removed} registro(s) em emails removido(s)`);

  await new Promise((r) => setTimeout(r, 400));

  await createEmailAccount(companyId, password);
  console.log("  cPanel: conta criada com DEFAULT_PWD");

  await prisma.email.create({
    data: {
      email: fullEmail,
      companyId,
      isActive: true,
      imapPassword: null,
    },
  });
  console.log("  BD: registro criado (imapPassword vazio → usa DEFAULT_PWD)");
}
