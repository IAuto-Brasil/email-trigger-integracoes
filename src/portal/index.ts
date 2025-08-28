import { ParsedEmail } from "../services/emailMonitor";
import processChavesNaMao from "./chavesnamao";
import processIcarros from "./icarros";

export default function processEmail(email: ParsedEmail) {
  console.log(email);
  const portalDomain = email.from?.split("@")[1] || "";

  if (portalDomain.includes("icarros")) {
    return processIcarros(email);
  }

  if (portalDomain.includes("chavesnamao")) {
    return processChavesNaMao(email);
  }

  return null;
}
