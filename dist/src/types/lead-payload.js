"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLeadPayload = isLeadPayload;
exports.toApiLeadJson = toApiLeadJson;
const phone_1 = require("../utils/phone");
function isLeadPayload(data) {
    return (!!data &&
        typeof data === "object" &&
        typeof data.leadName === "string" &&
        typeof data.to === "string" &&
        typeof data.from === "string" &&
        typeof data.portal === "string");
}
/** JSON final enviado para `receive-email-lead` (telefone normalizado quando possível). */
function toApiLeadJson(payload) {
    const normalized = (0, phone_1.normalizePhone)(payload.leadPhone || null);
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
//# sourceMappingURL=lead-payload.js.map