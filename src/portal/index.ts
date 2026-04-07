import processEmailWithGPT from "./process-email-with-chat-gpt";

export default async function processEmail(email: any) {
  try {
    return await processEmailWithGPT(email);
  } catch (error) {
    console.error("❌ Erro ao processar email:", error);
    return null;
  }
}
