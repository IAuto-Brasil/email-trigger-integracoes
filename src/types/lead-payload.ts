import { normalizePhone } from "../utils/phone";

/** Payload extraído (GPT/cache) — mesmo contrato enviado à API de leads. */
export type LeadPayload = {
  leadName: string;
  leadEmail?: string | null;
  leadPhone?: string | null;
  vehicle?: string | null;
  from: string;
  to: string;
  portal: string;
  valueRaw?: string | null;
  value?: string | null;
};

export function isLeadPayload(data: unknown): data is LeadPayload {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as LeadPayload).leadName === "string" &&
    typeof (data as LeadPayload).to === "string" &&
    typeof (data as LeadPayload).from === "string" &&
    typeof (data as LeadPayload).portal === "string"
  );
}

/** JSON final enviado para `receive-email-lead` (telefone normalizado quando possível). */
export function toApiLeadJson(payload: LeadPayload): LeadPayload {
  const normalized = normalizePhone(payload.leadPhone || null);
  return {
    leadName: payload.leadName,
    leadEmail: payload.leadEmail ?? null,
    leadPhone: normalized ?? payload.leadPhone ?? null,
    vehicle: payload.vehicle ?? null,
    from: payload.from,
    to: payload.to,
    portal: payload.portal,
    valueRaw: payload.valueRaw ?? null,
    value: payload.value ?? null,
  };
}
