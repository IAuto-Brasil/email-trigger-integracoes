/**
 * Lista contas da tabela `emails` (Prisma), uma a uma, e pergunta se deve apagar.
 * y/sim → remove no cPanel (API) e no PostgreSQL (registro + processed + cache relacionado).
 * n → pula.
 *
 * Uso: npm run cleanup-emails
 */
import "dotenv/config";
import readline from "readline";
import { prisma } from "../prisma";
import { deleteEmailAccount } from "../src/services/cpanel-service";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim().toLowerCase()));
  });
}

function wantsDelete(answer: string): boolean {
  return ["y", "yes", "s", "sim"].includes(answer);
}

async function removeFromDatabase(accountEmail: string, emailId: number) {
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

async function main() {
  const { CPANEL_HOST, CPANEL_USER, CPANEL_TOKEN, CPANEL_DOMAIN, DATABASE_URL } =
    process.env;
  if (!CPANEL_HOST || !CPANEL_USER || !CPANEL_TOKEN || !CPANEL_DOMAIN) {
    console.error(
      "Configure CPANEL_HOST, CPANEL_USER, CPANEL_TOKEN e CPANEL_DOMAIN no .env"
    );
    process.exit(1);
  }
  if (!DATABASE_URL) {
    console.error("Configure DATABASE_URL no .env");
    process.exit(1);
  }

  const rows = await prisma.email.findMany({
    orderBy: { email: "asc" },
  });

  console.log(
    `\n${rows.length} conta(s) cadastrada(s) no banco. Confirme cada exclusão.\n`
  );

  for (const row of rows) {
    const answer = await ask(`${row.email}, deseja apagar? (y/n): `);

    if (!wantsDelete(answer)) {
      console.log("  → não apagado (skip)\n");
      continue;
    }

    try {
      await deleteEmailAccount(row.email);
    } catch (err) {
      console.error("  → falha no cPanel; banco não foi alterado:", err);
      console.log("");
      continue;
    }

    try {
      await removeFromDatabase(row.email, row.id);
      console.log("  → removido no cPanel e no banco de dados.\n");
    } catch (err) {
      console.error(
        "  → ATENÇÃO: conta removida no cPanel, mas falhou ao limpar o banco:",
        err
      );
      console.log(
        "  → Ajuste o banco manualmente ou rode o script de novo (o e-mail pode não existir mais no cPanel).\n"
      );
    }
  }

  rl.close();
  await prisma.$disconnect();
  console.log("Encerrado.");
}

main().catch(async (e) => {
  console.error(e);
  rl.close();
  await prisma.$disconnect();
  process.exit(1);
});
