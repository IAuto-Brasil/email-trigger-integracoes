/** Limite do local-part do e-mail (RFC 5321). */
const MAX_LEN = 64;

/**
 * Parte local do e-mail no cPanel: letras, números, ponto, hífen e sublinhado.
 * Aceita IDs numéricos, slugs (ex.: b69bc8b5) e UUID (com hífens).
 */
const SAFE_LOCAL_PART = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

/**
 * Decodifica o segmento da URL, valida e retorna o id da empresa ou null.
 */
export function parseCompanyIdParam(raw: string | undefined): string | null {
  if (raw == null || raw === "") return null;
  let s: string;
  try {
    s = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  if (!s || s.length > MAX_LEN) return null;
  if (!SAFE_LOCAL_PART.test(s)) return null;
  return s;
}
