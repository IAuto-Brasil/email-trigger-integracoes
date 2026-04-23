/**
 * Remove cada conta no cPanel + PostgreSQL (processed/cache/email) e recria no cPanel
 * com DEFAULT_PWD e um novo registro em `emails` (sem imapPassword → usa .env).
 *
 * Uso: npm run reset-emails-bulk
 */
import "dotenv/config";
import { prisma } from "../prisma";
import { config } from "../src/config";
import { recreateEmailAccount } from "./lib/email-account-reset";

const COMPANY_IDS = [
  "04f01fde",
  "0b8cbdde",
  "0be0618b",
  "0bf26389",
  "150dc4b3",
  "159093f2",
  "16cc01aa",
  "1c887e9b",
  "1ff94ef6",
  "20adea59",
  "21f86a8c",
  "22f1da99",
  "274bd1bd",
  "27633f2f",
  "2764d5be",
  "2e997f30",
  "32dd7239",
  "33aaf25e",
  "3d832728",
  "3ea3e1fa",
  "3f99ece7",
  "48ee7ddd",
  "5c52291d",
  "5dc31651",
  "613a11a0",
  "61de97ca",
  "63347708",
  "68a2e418",
  "6c98a2a2",
  "6d18327f",
  "7144f9c4",
  "7187558e",
  "758053e0",
  "7f93f903",
  "803a1ab5",
  "868a6daf",
  "9475dcdc",
  "961a64e7",
  "98d59d05",
  "99801bc4",
  "9a5416ec",
  "9ac2fc31",
  "9ba124ca",
  "a0caa1bd",
  "a548bb15",
  "a67e3824",
  "a7ab68ba",
  "b0ae3af9",
  "b2c3d4e5",
  "b6841301",
  "b69bc8b5",
  "b88b54cc",
  "bd7072be",
  "c429e337",
  "c435c0e8",
  "c5389b42",
  "c9d2df59",
  "cefce2ad",
  "d01a51a8",
  "d341f77d",
  "d4962945",
  "db27c518",
  "ded9ff47",
  "e5e3a087",
  "e895ac32",
  "e8d461e1",
  "e94a29f9",
  "eadf5ef9",
  "f173f6a0",
  "f1f1a04d",
  "f5bd457d",
  "f60e5ee6",
  "f7bfaad4",
] as const;

async function main() {
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

  const uniqueIds = [...new Set(COMPANY_IDS.map((id) => id.trim().toLowerCase()))];
  if (uniqueIds.length !== COMPANY_IDS.length) {
    console.warn(
      `Aviso: havia IDs duplicados na lista; processando ${uniqueIds.length} únicos.`
    );
  }

  console.log(
    `Esta operação apaga e recria ${uniqueIds.length} contas no domínio ${CPANEL_DOMAIN} (cPanel + BD).`
  );
  console.log(`Senha usada na criação: (DEFAULT_PWD do .env, ${password.length} caracteres)`);

  let ok = 0;
  let fail = 0;

  for (const companyId of uniqueIds) {
    try {
      await recreateEmailAccount(companyId, password);
      ok++;
    } catch (e) {
      fail++;
      console.error(`  ERRO FATAL em ${companyId}:`, e);
    }
  }

  console.log(`\nResumo: ${ok} OK, ${fail} falha(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
