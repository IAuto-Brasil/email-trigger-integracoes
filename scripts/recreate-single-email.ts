/**
 * Recria UMA conta no cPanel + PostgreSQL com DEFAULT_PWD (mesmo fluxo do reset em lote).
 *
 * Uso:
 *   npm run recreate-email -- 232ddf40
 *   npm run recreate-email -- 232ddf40@iautobrasil.com
 */
import "dotenv/config";
import { prisma } from "../prisma";
import { config } from "../src/config";
import { parseCompanyIdParam } from "../src/utils/company-id";
import { recreateEmailAccount } from "./lib/email-account-reset";

function extractCompanyId(arg: string): string | null {
  const t = arg.trim();
  if (!t) return null;
  const local = t.includes("@") ? t.split("@")[0]!.trim() : t;
  return parseCompanyIdParam(local);
}

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error(
      "Uso: npm run recreate-email -- <companyId>\n" +
        "Ex.: npm run recreate-email -- 232ddf40\n" +
        "     npm run recreate-email -- 232ddf40@iautobrasil.com"
    );
    process.exit(1);
  }

  const {
    CPANEL_HOST,
    CPANEL_USER,
    CPANEL_TOKEN,
    CPANEL_DOMAIN,
    DATABASE_URL,
    DEFAULT_PWD,
  } = process.env;

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

  const password = DEFAULT_PWD ?? config.defaultPwd;
  if (!password || String(password).trim() === "") {
    console.error("Configure DEFAULT_PWD no .env");
    process.exit(1);
  }

  const companyId = extractCompanyId(raw);
  if (!companyId) {
    console.error(
      "ID inválido. Use letras, números, . _ - (até 64 caracteres), ex.: 232ddf40"
    );
    process.exit(1);
  }

  console.log(
    `Recriando ${companyId}@${CPANEL_DOMAIN} com senha do DEFAULT_PWD (${String(password).length} caracteres)...`
  );

  await recreateEmailAccount(companyId, password);
  console.log("\nConcluído.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
