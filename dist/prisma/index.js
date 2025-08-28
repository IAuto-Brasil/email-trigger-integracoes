"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const prisma_1 = require("../src/generated/prisma");
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new prisma_1.PrismaClient({
        log: ["query"],
    });
if (process.env.NODE_ENV !== "production")
    globalForPrisma.prisma = exports.prisma;
//# sourceMappingURL=index.js.map