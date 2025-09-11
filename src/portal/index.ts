import processEmailWithGPT from "./process-email-with-chat-gpt";

export default function processEmail(email: any) {
  try {
    return processEmailWithGPT(email);
  } catch (error) {
    console.error("❌ Erro ao processar email:", error);
    return null;
  }
}
