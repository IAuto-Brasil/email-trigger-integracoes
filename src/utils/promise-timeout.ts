/**
 * Rejeita com mensagem se `promise` não resolver em `ms`.
 * Limpa o timer quando `promise` completa.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(
        new Error(
          `Timeout após ${Math.round(ms / 1000)}s (${label}). Ciclo continua.`
        )
      );
    }, ms);
    void Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
