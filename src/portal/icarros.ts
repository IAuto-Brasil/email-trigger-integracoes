import { ParsedEmail } from "../services/emailMonitor";

function qpSoftBreakTrim(s: string) {
  // remove '=' no fim de linha (soft break do quoted-printable) e espaços extras
  return s
    .replace(/=\r?\n/g, "")
    .replace(/=\s*$/g, "")
    .trim();
}

export default function processIcarros(email: ParsedEmail) {
  const text = email.text;
  const subject = (email.subject || "").toString();

  if (!text) {
    return null;
  }

  // Nome
  const nameMatch = text!.match(/Nome\s+([\s\S]*?)\n/);
  const leadName = nameMatch ? nameMatch[1].trim() : "";

  // Email
  const emailMatch = text!.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  const leadEmail = emailMatch ? emailMatch[0].trim() : "";

  // Telefone
  const phoneMatch = text!.match(/\(?\d{2}\)?\s?\d{4,5}-\d{4}/);
  const leadPhone = phoneMatch ? phoneMatch[0].trim() : "";

  // Veículo + valor
  let vehicle = "";
  let valueRaw = "";
  let value = "";

  const bodyAdMatch = text.match(/^(.*?)-\s*R\$\s*([\d\.,]+)\b.*$/m);
  if (bodyAdMatch) {
    vehicle = qpSoftBreakTrim(bodyAdMatch[1]);
    valueRaw = `R$ ${bodyAdMatch[2]}`.replace(/\s+/g, " ").trim();
  } else {
    // 2) Fallback: tenta achar outra ocorrência de "R$" e pegar a linha completa
    const anyPriceLine = text.match(/^(.*R\$\s*[\d\.,]+.*)$/m);
    if (anyPriceLine) {
      const m = anyPriceLine[1].match(/^(.*?)-\s*R\$\s*([\d\.,]+)/);
      if (m) {
        vehicle = qpSoftBreakTrim(m[1]);
        valueRaw = `R$ ${m[2]}`.replace(/\s+/g, " ").trim();
      }
    }
  }

  // 3) Normaliza veículo: remove códigos no final (ex.: "(rfh6b58)") e sobras de '='
  if (vehicle) {
    vehicle = vehicle
      .replace(/\([^)]*\)\s*$/g, "") // remove "(...)"
      .replace(/=\s*$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // 4) Se ainda não encontrou veículo, tenta pelo Subject (ex.: "Proposta  Recebida: Fiat Argo 1.0 Drive ano 2020.0")
  if (!vehicle && subject) {
    const subjVehicle = subject.match(/Proposta\s+Recebida:\s*(.+)$/i);
    if (subjVehicle) vehicle = subjVehicle[1].trim();
  }

  // 5) Normaliza valor numérico (apenas dígitos) p/ banco
  if (valueRaw) {
    value = valueRaw.replace(/[^\d]/g, ""); // ex.: "56.900" -> "56900"
  }

  return {
    leadName,
    leadEmail,
    leadPhone,
    vehicle,
    from: email.from,
    to: email.to,
    portal: "iCarros",
    valueRaw,
    value,
  };
}
