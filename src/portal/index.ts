import processEmailWithGPT from "./processEmailWithGPT";

export default function processEmail(email: any) {
  // gerenciar com RabbitMQ
  try {
    return processEmailWithGPT(email);
  } catch (error) {
    console.error("❌ Erro ao processar email:", error);
    return null;
  }
}
