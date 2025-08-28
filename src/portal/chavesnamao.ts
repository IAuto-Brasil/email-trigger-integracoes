import { ParsedEmail } from "../services/emailMonitor";

export default function processChavesNaMao(email: ParsedEmail) {
  const html = email.html;

  if (!html) {
    return null;
  }

  // Nome
  const nameMatch = html.match(/<b[^>]*>Nome:?<\/b>([^<]+)/i);
  const leadName = nameMatch ? nameMatch[1].trim() : "";

  // Telefone
  const phoneMatch = html.match(/\(?\d{2}\)?\s?\d{4,5}-\d{4}/);
  const leadPhone = phoneMatch ? phoneMatch[0].trim() : "";

  const emailMatch = html.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  const leadEmail = emailMatch ? emailMatch[0].trim() : "";

  // Veículo
  const vehicleMatch = html.match(/<h3[^>]*>([^<]+)<\/h3>/i);
  const vehicle = vehicleMatch ? `${vehicleMatch[1].trim()}` : "";

  // Valor
  const valueMatch = html.match(/R\$ ?[\d\.\,]+/);
  let valueRaw = "";
  let value = "";
  if (valueMatch) {
    valueRaw = valueMatch[0];
    value = valueRaw.replace(/[^\d]/g, ""); // normaliza para 69900
  }

  return {
    leadName,
    leadEmail,
    leadPhone,
    vehicle,
    from: email.from,
    to: email.to,
    portal: "chavesnamao",
    valueRaw,
    value,
  };
}
