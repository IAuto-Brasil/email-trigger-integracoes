"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTransientImapError = isTransientImapError;
/**
 * Indica se o erro costuma ser transitório (rede / servidor) e justifica retentativas.
 * Falhas de autenticação explícita não são transientes.
 */
function isTransientImapError(err) {
    if (err == null)
        return false;
    if (typeof err === "string") {
        return matchesTransientMessage(err);
    }
    if (typeof err !== "object")
        return false;
    const o = err;
    if (o.authenticationFailed)
        return false;
    const text = o.message || o.code || String(err);
    return matchesTransientMessage(String(text).toLowerCase());
}
function matchesTransientMessage(m) {
    const s = m.toLowerCase();
    if (!s)
        return false;
    return /close|reset|econn|etimed|timeout|socket|abrupt|network|tls|unexpected|tempor|unavailable|refused|enotfo|eai_/.test(s);
}
//# sourceMappingURL=imap-transient.js.map