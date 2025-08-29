import { ParsedEmail } from "../services/emailMonitor";
import processChavesNaMao from "./chavesnamao";
import processIcarros from "./icarros";
import processMobiauto from "./mobiauto";
import processUsadosBr from "./usadosbr";

export default function processEmail(email: ParsedEmail) {
  const portalDomain = email.from?.split("@")[1] || "";

  // Normaliza o campo "to" para array
  let toArray: string[] = [];
  if (Array.isArray(email.to)) {
    toArray = email.to;
  } else if (typeof email.to === "string") {
    toArray = email.to.split(",").map((t) => t.trim());
  }

  // Filtra somente os que têm domínio iautobrasil.com
  const iauto = toArray.find((to) => to.includes("@iautobrasil.com"));
  if (iauto) {
    email.to = iauto;
  }

  if (portalDomain.includes("icarros")) {
    console.log("NOVO LEAD DA Icarros");
    return processIcarros(email);
  }

  if (portalDomain.includes("chavesnamao")) {
    console.log("NOVO LEAD DA Chaves Na Mao");
    return processChavesNaMao(email);
  }

  if (portalDomain.includes("usadosbr")) {
    console.log("NOVO LEAD DA UsadosBr");
    return processUsadosBr(email);
  }

  if (portalDomain.includes("mobiauto")) {
    console.log("NOVO LEAD DA Mobiauto");
    return processMobiauto(email);
  }

  if (portalDomain.includes("socarrao")) {
    console.log("NOVO LEAD DO Socarrao");
    console.log(email.html);
  }

  return null;
}
