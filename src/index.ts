import { prisma } from "../prisma";

async function main() {
  try {
    console.log("🔍 Testando conexão com o banco de dados...");

    // Testa a conexão com o banco
    await prisma.$connect();
    console.log("✅ Conexão com banco de dados estabelecida");

    // Mostra estatísticas
    const emailCount = await prisma.email.count();
    const receivedEmailCount = await prisma.receivedEmail.count();

    console.log(`📊 Estatísticas:`);
    console.log(`   - Contas de email cadastradas: ${emailCount}`);
    
  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executa apenas se este arquivo for executado diretamente
if (require.main === module) {
  main();
}
