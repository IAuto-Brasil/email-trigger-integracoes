import client from "../openai";

export type LeadJson = {
  leadName: string;
  leadEmail: string;
  leadPhone: string; // ex.: "21 970042051" (só dígitos e espaços)
  vehicle: string;
  from: string;
  to: string;
  portal: string;
  valueRaw: string; // ex.: "R$ 84.900"
  value: string; // ex.: "84900" (apenas dígitos)
};

type ParsedEmail = {
  subject?: string;
  from?: string;
  to?: string;
  headers?: string;
  text?: string;
  html?: string;
  portalHint?: string; // opcional: "iCarros", "SóCarrão", etc.
};

const SYS_PROMPT = `
Você é um extrator de dados de e-mails de portais automotivos.
TAREFA: Ler o conteúdo (headers, subject, texto e HTML) e retornar EXATAMENTE um array JSON com UM objeto contendo os campos:
[
  {
    "leadName": "...",    // Separe o nome do lead de um suposto nome comercial, ex: João Car Shop > João, ou Carros do Fernando Lima > Fernando Lima
    "leadEmail": "...",   // Dentro do HTML, busque o email do lead, não do remetente ou destinatário
    "leadPhone": "...",   // Formate como DDI DDD e número juntos, ex.: "5521970042051" sem espacos
    "vehicle": "...",     // Nome completo do veículo (marca, modelo, versão, ano quando houver)
    "from": "...",        // remetente (email)
    "to": "...",          // destinatário (email) sempre utilize o destinário que contenha o domain @iautobrasil.com, ex: 15@iautobrasil.com, 76@iautobrasil.com e etc... {id}@iautobrasil.com
    "portal": "...",      // nome do portal (ex.: "iCarros", "SóCarrão", "NaPista", "MobiAuto", "UsadosBr")
    "valueRaw": "...",    // preço no formato BR com R$, ex.: "R$ 56.900", "R$ 108.900"
    "value": "..."        // apenas dígitos do preço, ex.: "56900" ou "10890000" se vier com centavos
  }
]

REGRAS:
- Retorne SOMENTE o array JSON acima. Nada de comentários, texto extra ou campos adicionais.
- Se faltar alguma informação no e-mail, deixe o campo vazio "" (nunca use null).
- "value": extraia apenas dígitos. Se houver centavos, deixe os sem (ex.: "10890000" para "R$ 108.900").
- "valueRaw": deve começar por "R$ " e usar separador BR (ponto para milhar e vírgula para centavos), ex.: "R$ 56.900" ou "R$ 108.900".
- "portal": use uma das pistas (domínio do remetente, assinatura, logos) para inferir. Se não der, use a dica recebida (portalHint).
- "from" e "to": devem ser e-mails; se houver múltiplos "to", escolha o que conter o domain @iautobrasil.com correspondente ao id  da loja.
- "leadPhone": mantenha apenas dígitos  Ex.: "(21) 97004-2051" -> "21970042051".
- NUNCA mude os nomes dos campos. NUNCA retorne mais de um objeto no array.
`;

// Pequena ajudinha para delimitar o payload sem confundir o modelo
function buildUserPrompt(email: ParsedEmail) {
  const parts = [
    "### HEADERS ###",
    (email.headers || "").slice(0, 200000),
    "\n\n### SUBJECT ###\n" + (email.subject || ""),
    "\n\n### FROM ###\n" + (email.from || ""),
    "\n\n### TO ###\n" + (email.to || ""),
    "\n\n### PORTAL HINT ###\n" + (email.portalHint || ""),
    "\n\n### HTML ###\n" + (email.html || ""),
  ];
  return parts.join("\n");
}

// Parsing resiliente do JSON (tenta achar o primeiro '[' até o par correspondente)
function safeParseArray(jsonStr: string): LeadJson[] {
  try {
    const first = jsonStr.indexOf("[");
    const last = jsonStr.lastIndexOf("]");
    if (first >= 0 && last > first) {
      const slice = jsonStr.slice(first, last + 1);
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed)) return parsed as LeadJson[];
    }
    // fallback direto
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed as LeadJson[];
  } catch (_) {}
  throw new Error("Falha ao parsear JSON retornado pelo modelo.");
}

// Normaliza garantias mínimas (não quebra seu contrato)
function postNormalize(item: LeadJson, email: ParsedEmail): LeadJson {
  const norm = { ...item };

  // Garantir portal se veio vazio
  if (!norm.portal && email.portalHint) norm.portal = email.portalHint;

  // Garantir from/to se vazios, usando os do e-mail
  if (!norm.from && email.from) norm.from = email.from;
  if (!norm.to && email.to) norm.to = email.to;

  // value: só dígitos
  if (norm.value) norm.value = norm.value.replace(/\D+/g, "");

  // valueRaw: garantir "R$ " no começo se houver número
  if (norm.value && !norm.valueRaw) {
    // monta um "R$ xxx" simples (sem centavos) se não informado
    const int = norm.value.replace(/^0+/, "") || "0";
    // adiciona pontos a cada 3 dígitos
    const br = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    norm.valueRaw = `R$ ${br}`;
  }

  // Campos obrigatórios vazios viram string vazia (já estão)
  const fields: (keyof LeadJson)[] = [
    "leadName",
    "leadEmail",
    "leadPhone",
    "vehicle",
    "from",
    "to",
    "portal",
    "valueRaw",
    "value",
  ];
  for (const f of fields) {
    if ((norm as any)[f] == null) (norm as any)[f] = "";
  }

  return norm;
}

// Chamada principal
export default async function processEmailWithGPT(
  email: ParsedEmail
): Promise<LeadJson> {
  const userPrompt = buildUserPrompt(email);

  // 1ª tentativa
  let resp = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    temperature: 0,
    messages: [
      { role: "system", content: SYS_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  let text = resp.choices?.[0]?.message?.content || "";

  // Se não veio um array JSON, tenta uma 2ª vez pedindo correção
  if (!text.includes("[") || !text.includes("]")) {
    const fix = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      temperature: 0,
      messages: [
        { role: "system", content: SYS_PROMPT },
        { role: "user", content: userPrompt },
        { role: "assistant", content: text },
        {
          role: "user",
          content:
            "Corrija: responda SOMENTE com o array JSON exigido (sem comentários).",
        },
      ],
    });
    text = fix.choices?.[0]?.message?.content || text;
  }

  const arr = safeParseArray(text);
  // Pós-normalização para garantir seu contrato
  const normalized = arr.slice(0, 1).map((x) => postNormalize(x, email));

  // Garante que é exatamente 1 objeto (como você exemplificou)
  return normalized.length
    ? normalized[0]
    : {
        leadName: "",
        leadEmail: "",
        leadPhone: "",
        vehicle: "",
        from: email.from || "",
        to: email.to || "",
        portal: email.portalHint || "",
        valueRaw: "",
        value: "",
      };
}
