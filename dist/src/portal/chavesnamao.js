"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = processChavesNaMao;
function processChavesNaMao(email) {
    const html = email.html;
    if (!html) {
        return null;
    }
    // Nome
    const nameMatch = html.match(/<b[^>]*>Nome:?<\/b>([^<]+)/i);
    const leadName = nameMatch ? nameMatch[1].trim() : "";
    // Telefone
    const phoneMatch = html.match(/<b[^>]*>Telefone:?<\/b>\s*([^<]+)/i);
    const leadPhone = phoneMatch ? phoneMatch[1].trim() : "";
    // Email
    const emailMatch = html.match(/<b[^>]*>Email:?<\/b>\s*([^<]+)/i);
    const leadEmail = emailMatch ? emailMatch[1].trim() : "";
    // Veículo
    const vehicleMatch = html.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    const vehicle = vehicleMatch ? `${vehicleMatch[1].trim()}` : "";
    // Valor
    const valueMatch = html.match(/R\$ ?[\d\.\,]+/);
    let valueRaw = "";
    let value = "";
    if (valueMatch) {
        valueRaw = valueMatch[0];
        value = valueRaw.replace(/[^\d]/g, ""); // normaliza para 69900
    }
    return {
        leadName,
        leadEmail,
        leadPhone,
        vehicle,
        from: email.from,
        to: email.to,
        portal: "chavesnamao",
        valueRaw,
        value,
    };
}
//# sourceMappingURL=chavesnamao.js.map