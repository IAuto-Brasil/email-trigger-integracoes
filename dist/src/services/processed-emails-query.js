"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEmailAccount = resolveEmailAccount;
exports.getRecentProcessedLeads = getRecentProcessedLeads;
const prisma_1 = require("../../prisma");
const lead_payload_1 = require("../types/lead-payload");
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
function clampLimit(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1)
        return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.floor(n));
}
/** Resolve conta por `Email.id` (numérico) ou endereço completo. */
async function resolveEmailAccount(identifier) {
    const trimmed = identifier.trim();
    if (!trimmed)
        return null;
    if (/^\d+$/.test(trimmed)) {
        const id = Number.parseInt(trimmed, 10);
        if (id > 0) {
            const byId = await prisma_1.prisma.email.findUnique({ where: { id } });
            if (byId)
                return byId;
        }
    }
    return prisma_1.prisma.email.findFirst({
        where: {
            email: { equals: trimmed, mode: "insensitive" },
        },
    });
}
async function getRecentProcessedLeads(identifier, limitParam) {
    const account = await resolveEmailAccount(identifier);
    if (!account)
        return null;
    const limit = clampLimit(limitParam);
    const processed = await prisma_1.prisma.processedEmail.findMany({
        where: { accountEmail: account.email },
        orderBy: { processedAt: "desc" },
        take: limit,
    });
    if (processed.length === 0) {
        return {
            account: {
                id: account.id,
                email: account.email,
                companyId: account.companyId,
                isActive: account.isActive,
            },
            count: 0,
            limit,
            items: [],
        };
    }
    const caches = await prisma_1.prisma.parsedEmailCache.findMany({
        where: {
            messageId: { in: processed.map((p) => p.messageId) },
        },
    });
    const payloadByMessageId = new Map(caches.map((c) => [c.messageId, c.payload]));
    const items = processed.map((row) => {
        const raw = payloadByMessageId.get(row.messageId);
        const lead = raw && (0, lead_payload_1.isLeadPayload)(raw) ? (0, lead_payload_1.toApiLeadJson)(raw) : null;
        return {
            messageId: row.messageId,
            uid: row.uid,
            processedAt: row.processedAt.toISOString(),
            receivedAt: row.receivedAt.toISOString(),
            subject: row.subject,
            fromEmail: row.fromEmail,
            toEmail: row.toEmail,
            lead,
        };
    });
    return {
        account: {
            id: account.id,
            email: account.email,
            companyId: account.companyId,
            isActive: account.isActive,
        },
        count: items.length,
        limit,
        items,
    };
}
//# sourceMappingURL=processed-emails-query.js.map