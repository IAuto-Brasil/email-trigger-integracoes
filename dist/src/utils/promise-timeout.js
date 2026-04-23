"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTimeout = withTimeout;
/**
 * Rejeita com mensagem se `promise` não resolver em `ms`.
 * Limpa o timer quando `promise` completa.
 */
function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            reject(new Error(`Timeout após ${Math.round(ms / 1000)}s (${label}). Ciclo continua.`));
        }, ms);
        void Promise.resolve(promise).then((v) => {
            clearTimeout(t);
            resolve(v);
        }, (e) => {
            clearTimeout(t);
            reject(e);
        });
    });
}
//# sourceMappingURL=promise-timeout.js.map