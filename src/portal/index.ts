import { ParsedEmail } from "../services/emailMonitor";
import processEmailWithGPT from "./processEmailWithGPT";
// import processChavesNaMao from "./chavesnamao";
// import processIcarros from "./icarros";
// import processMobiauto from "./mobiauto";
// import processSocarrao from "./socarrao";
// import processUsadosBr from "./usadosbr";

export default function processEmail(email: any) {
  try {
    return processEmailWithGPT(email);
  } catch (error) {
    console.error("❌ Erro ao processar email:", error);
    return null;
  }
}
