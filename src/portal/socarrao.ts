import { ParsedEmail } from "../services/emailMonitor";

// helpers
const strip = (s: string) => s.replace(/\s+/g, " ").trim();
const digits = (s: string) => (s || "").replace(/\D+/g, "");

// Formata telefone BR: (21) 97004-2051
function formatBrPhone(raw: string) {
  const d = digits(raw);
  if (d.length < 10) return raw.trim();
  // pega últimos 10-11 dígitos (descarta +55 se vier)
  const core = d.slice(-11);
  if (core.length === 11) {
    return `(${core.slice(0, 2)}) ${core.slice(2, 7)}-${core.slice(7)}`;
  }
  return `(${core.slice(0, 2)}) ${core.slice(2, 6)}-${core.slice(6)}`;
}

// Converte “108,900.00” (estilo US) ou “108.900,00” (BR) em:
// - valueRaw amigável ("R$ 108.900,00")
// - value numérico apenas dígitos (ex.: "10890000")
function normalizeValue(raw: string) {
  const t = raw.trim();

  // Detecta padrão US (1,234.56) vs BR (1.234,56)
  const usLike =
    /^\d{1,3}(,\d{3})+(\.\d{2})?$/.test(t) || /^\d+(\.\d{2})?$/.test(t);
  let valueRaw = t;
  let value = "";

  if (usLike) {
    // "108,900.00" -> value: "10890000"
    value = t.replace(/[^\d]/g, "");
    // valueRaw BR bonito: 108900.00 -> 108.900,00
    const [intPart, cents = "00"] = t.replace(/,/g, "").split(".");
    const brInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    valueRaw = `R$ ${brInt},${cents.padEnd(2, "0")}`;
  } else {
    // BR like: "108.900,00" -> digits only
    value = t.replace(/[^\d]/g, "");
    valueRaw = t.startsWith("R$") ? t : `R$ ${t}`;
  }

  return { valueRaw: valueRaw.trim(), value };
}

export default function processSocarrao(email: ParsedEmail) {
  const html = (email.html || "").toString();
  const text = (email.text || "").toString();

  if (!html && !text) return null;

  // Preferimos o HTML (tem labels previsíveis)
  const src = html || text;

  // Cliente
  const leadName = (() => {
    const m =
      src.match(/<strong>\s*De:\s*<\/strong>\s*([^<]+)/i) ||
      src.match(/De:\s*([^\n\r]+)/i);
    return m ? strip(m[1]) : "";
  })();

  const leadEmail = (() => {
    const m =
      src.match(/<strong>\s*Email:\s*<\/strong>\s*([^<]+)/i) ||
      src.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return m ? strip(m[1] || m[0]) : "";
  })();

  const leadPhone = (() => {
    // tenta o campo rotulado e, se não houver, pega o tel: do botão
    const m =
      src.match(/<strong>\s*Telefone:\s*<\/strong>\s*([^<]+)/i) ||
      src.match(/href=['"]tel:([^'"]+)['"]/i);
    return m ? formatBrPhone(m[1]) : "";
  })();

  // Veículo (Marca, Modelo, Ano)
  const marca = (() => {
    const m = src.match(/<strong>\s*Marca:\s*<\/strong>\s*([^<]+)/i);
    return m ? strip(m[1]) : "";
  })();
  const modelo = (() => {
    const m = src.match(/<strong>\s*Modelo:\s*<\/strong>\s*([^<]+)/i);
    return m ? strip(m[1]) : "";
  })();
  const ano = (() => {
    const m = src.match(/<strong>\s*Ano:\s*<\/strong>\s*(\d{4})/i);
    return m ? strip(m[1]) : "";
  })();

  let vehicle = "";
  if (marca || modelo || ano) {
    vehicle = strip([marca, modelo, ano].filter(Boolean).join(" "));
  } else {
    // fallback: tenta a URL de detalhes se existir
    const m = src.match(/socarrao\.com\.br\/veiculos\/detalhes\/(\d+)/i);
    if (m) vehicle = `Veículo SóCarrão #${m[1]}`;
  }

  // Valor
  let valueRaw = "";
  let value = "";
  const valorMatch =
    src.match(/<strong>\s*Valor:\s*<\/strong>\s*([^<]+)/i) ||
    src.match(/\bValor:\s*([^\n\r<]+)/i);
  if (valorMatch) {
    const norm = normalizeValue(strip(valorMatch[1]));
    valueRaw = norm.valueRaw;
    value = norm.value;
  }

  return {
    leadName,
    leadEmail,
    leadPhone,
    vehicle, // Ex.: "BMW 320i 2.0 16V TB ACTIVEFLEX 2016"
    from: email.from,
    to: email.to,
    portal: "SóCarrão",
    valueRaw, // Ex.: "R$ 108.900,00"
    value, // Ex.: "10890000" (só dígitos)
  };
}
