/**
 * Indica se o erro costuma ser transitório (rede / servidor) e justifica retentativas.
 * Falhas de autenticação explícita não são transientes.
 */
export function isTransientImapError(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err === "string") {
    return matchesTransientMessage(err);
  }
  if (typeof err !== "object") return false;
  const o = err as { authenticationFailed?: boolean; message?: string; code?: string };
  if (o.authenticationFailed) return false;
  const text = o.message || o.code || String(err);
  return matchesTransientMessage(String(text).toLowerCase());
}

function matchesTransientMessage(m: string): boolean {
  const s = m.toLowerCase();
  if (!s) return false;
  return /close|reset|econn|etimed|timeout|socket|abrupt|network|tls|unexpected|tempor|unavailable|refused|enotfo|eai_/.test(
    s
  );
}
