"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPermanentWhatsAppError = isPermanentWhatsAppError;
function isPermanentWhatsAppError(httpError, serverMessage, normalizedPhone) {
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
//# sourceMappingURL=errors.js.map