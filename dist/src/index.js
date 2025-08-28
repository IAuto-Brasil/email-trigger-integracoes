"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../prisma");
async function main() {
    try {
        console.log("🔍 Testando conexão com o banco de dados...");
        // Testa a conexão com o banco
        await prisma_1.prisma.$connect();
        console.log("✅ Conexão com banco de dados estabelecida");
        // Mostra estatísticas
        const emailCount = await prisma_1.prisma.email.count();
        const receivedEmailCount = await prisma_1.prisma.receivedEmail.count();
        console.log(`📊 Estatísticas:`);
        console.log(`   - Contas de email cadastradas: ${emailCount}`);
        console.log(`   - Emails recebidos: ${receivedEmailCount}`);
        // Se não houver nenhuma conta, você pode descomentar as linhas abaixo para criar uma de teste
        /*
        if (emailCount === 0) {
          console.log("📝 Criando conta de teste...");
          const result = await emailService.createAndMonitorEmail("teste");
          console.log("Resultado:", result);
        }
        */
    }
    catch (error) {
        console.error("❌ Erro:", error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
// Executa apenas se este arquivo for executado diretamente
if (require.main === module) {
    main();
}
//# sourceMappingURL=index.js.map