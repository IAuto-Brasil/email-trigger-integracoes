import { prisma } from "../../prisma";
import { Email } from "../generated/prisma";
import {
  isLeadPayload,
  LeadPayload,
  toApiLeadJson,
} from "../types/lead-payload";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type ProcessedLeadItem = {
  messageId: string;
  uid: number;
  processedAt: string;
  receivedAt: string;
  subject: string | null;
  fromEmail: string | null;
  toEmail: string | null;
  /** JSON final (API de leads); `null` se não houver cache/parsing válido. */
  lead: LeadPayload | null;
};

export type ProcessedLeadsQueryResult = {
  account: {
    id: number;
    email: string;
    companyId: string;
    isActive: boolean;
  };
  count: number;
  limit: number;
  items: ProcessedLeadItem[];
};

function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

/** Resolve conta por `Email.id` (numérico) ou endereço completo. */
export async function resolveEmailAccount(
  identifier: string
): Promise<Email | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const id = Number.parseInt(trimmed, 10);
    if (id > 0) {
      const byId = await prisma.email.findUnique({ where: { id } });
      if (byId) return byId;
    }
  }

  return prisma.email.findFirst({
    where: {
      email: { equals: trimmed, mode: "insensitive" },
    },
  });
}

export async function getRecentProcessedLeads(
  identifier: string,
  limitParam?: unknown
): Promise<ProcessedLeadsQueryResult | null> {
  const account = await resolveEmailAccount(identifier);
  if (!account) return null;

  const limit = clampLimit(limitParam);

  const processed = await prisma.processedEmail.findMany({
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

  const caches = await prisma.parsedEmailCache.findMany({
    where: {
      messageId: { in: processed.map((p) => p.messageId) },
    },
  });
  const payloadByMessageId = new Map(
    caches.map((c) => [c.messageId, c.payload])
  );

  const items: ProcessedLeadItem[] = processed.map((row) => {
    const raw = payloadByMessageId.get(row.messageId);
    const lead =
      raw && isLeadPayload(raw) ? toApiLeadJson(raw) : null;

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
