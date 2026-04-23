"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Recria UMA conta no cPanel + PostgreSQL com DEFAULT_PWD (mesmo fluxo do reset em lote).
 *
 * Uso:
 *   npm run recreate-email -- 232ddf40
 *   npm run recreate-email -- 232ddf40@iautobrasil.com
 */
require("dotenv/config");
const prisma_1 = require("../prisma");
const config_1 = require("../src/config");
const company_id_1 = require("../src/utils/company-id");
const email_account_reset_1 = require("./lib/email-account-reset");
function extractCompanyId(arg) {
    const t = arg.trim();
    if (!t)
        return null;
    const local = t.includes("@") ? t.split("@")[0].trim() : t;
    return (0, company_id_1.parseCompanyIdParam)(local);
}
async function main() {
    const raw = process.argv[2];
    if (!raw) {
        console.error("Uso: npm run recreate-email -- <companyId>\n" +
            "Ex.: npm run recreate-email -- 232ddf40\n" +
            "     npm run recreate-email -- 232ddf40@iautobrasil.com");
        process.exit(1);
    }
    const { CPANEL_HOST, CPANEL_USER, CPANEL_TOKEN, CPANEL_DOMAIN, DATABASE_URL, DEFAULT_PWD, } = process.env;
    if (!CPANEL_HOST || !CPANEL_USER || !CPANEL_TOKEN || !CPANEL_DOMAIN) {
        console.error("Configure CPANEL_HOST, CPANEL_USER, CPANEL_TOKEN e CPANEL_DOMAIN no .env");
        process.exit(1);
    }
    if (!DATABASE_URL) {
        console.error("Configure DATABASE_URL no .env");
        process.exit(1);
    }
    const password = DEFAULT_PWD ?? config_1.config.defaultPwd;
    if (!password || String(password).trim() === "") {
        console.error("Configure DEFAULT_PWD no .env");
        process.exit(1);
    }
    const companyId = extractCompanyId(raw);
    if (!companyId) {
        console.error("ID inválido. Use letras, números, . _ - (até 64 caracteres), ex.: 232ddf40");
        process.exit(1);
    }
    console.log(`Recriando ${companyId}@${CPANEL_DOMAIN} com senha do DEFAULT_PWD (${String(password).length} caracteres)...`);
    await (0, email_account_reset_1.recreateEmailAccount)(companyId, password);
    console.log("\nConcluído.");
    await prisma_1.prisma.$disconnect();
}
main().catch(async (e) => {
    console.error(e);
    await prisma_1.prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=recreate-single-email.js.map