import { PrismaClient } from "../src/generated/prisma";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error", "warn"], // opcional
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
