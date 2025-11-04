export function isPermanentWhatsAppError(
  httpError: any,
  serverMessage: string,
  normalizedPhone: string | null
): boolean {
  if (serverMessage?.includes("WhatsApp") && serverMessage?.includes('exists":false')) {
    return true;
  }

  if (!normalizedPhone) {
    return true;
  }

  if (/n[uú]mero inv[aá]lido|invalid number|formato inv[aá]lido/i.test(serverMessage || "")) {
    return true;
  }

  return false;
}
