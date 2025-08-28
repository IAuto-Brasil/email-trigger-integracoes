import { ParsedEmail } from "../services/emailMonitor";

export default function processIcarros(email: ParsedEmail) {
  const text = email.text;

  if (!text) {
    return null;
  }

  // Nome
  const nameMatch = text!.match(/Nome\s+([\s\S]*?)\n/);
  const leadName = nameMatch ? nameMatch[1].trim() : "";

  // Email
  const emailMatch = text!.match(/E-mail\s+([\s\S]*?)\n/);
  const leadEmail = emailMatch ? emailMatch[1].trim() : "";

  // Telefone
  const phoneMatch = text!.match(/Telefone\s+([\s\S]*?)\n/);
  const leadPhone = phoneMatch ? phoneMatch[1].trim() : "";

  // Veículo + valor
  const vehicleMatch = text!.match(/Toyota[\s\S]*?\n/);
  let vehicle = "";
  let valueRaw = "";
  let value = "";
  if (vehicleMatch) {
    vehicle = vehicleMatch[0].trim();
    const valueMatch = vehicle.match(/R\$ [0-9\.\,]+/);
    if (valueMatch) {
      valueRaw = valueMatch[0];
      value = valueRaw.replace(/[^\d]/g, ""); // "84900"
    }
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
