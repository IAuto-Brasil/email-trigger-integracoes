import { ParsedEmail } from "../services/emailMonitor";

export default function processMobiauto(email: ParsedEmail) {
  const html = email.html;

  if (!html) {
    return;
  }

  // Nome
  const nameMatch =
    html.match(/Nome[\s\r\n:]*([A-ZÀ-ÿ][^\n\r<]+)/i) ||
    html.match(/Nome(?:<\/p>)?[\s\r\n]*([A-ZÀ-ÿ][^\n\r<]+)/i) ||
    html.match(/Nome[\s\r\n]*([A-ZÀ-ÿ][^\n\r<]+)/i);

  const leadName = nameMatch ? nameMatch[1].trim() : "";

  // Email
  const emailMatch = html.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  const leadEmail = emailMatch ? emailMatch[0].trim() : "";

  // Telefone
  const phoneMatch = html.match(/(\(?\d{2}\)?\s?\d{4,5}-?\d{4})/);
  let leadPhone = phoneMatch ? phoneMatch[1].trim() : "";
  if (leadPhone && !leadPhone.includes("-") && !leadPhone.includes(")")) {
    leadPhone = leadPhone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
  }

  // Veículo
  const vehicleMatch =
    html.match(/Proposta Recebida:\s*([^\n\r]+)/i) ||
    html.match(/([A-Z][^\n\r]+)\(placa:/i);

  const vehicle = vehicleMatch ? vehicleMatch[1].trim() : "";

  // Valor
  const valueMatch = html.match(/R\$ ?[\d\.\,]+/);
  let valueRaw = "";
  let value = "";
  if (valueMatch) {
    valueRaw = valueMatch[0];
    value = valueRaw.replace(/[^\d]/g, "");
  }

  return {
    leadName,
    leadEmail,
    leadPhone,
    vehicle: vehicle,
    from: email.from,
    to: email.to,
    portal: "mobiauto",
    valueRaw,
    value,
  };
}
