"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const prisma_1 = require("../prisma");
const EmailService_1 = require("./services/EmailService");
const app = (0, express_1.default)();
// Middleware para parsing do JSON
app.use(express_1.default.json());
/**
 * Endpoint para criar email e iniciar monitoramento
 * POST /api/create-email/:companyId
 */
app.post("/api/create-email/:companyId", async (req, res) => {
    const { companyId } = req.params;
    // Validação básica
    if (!companyId || isNaN(Number(companyId))) {
        return res.status(400).json({
            success: false,
            message: "ID da empresa inválido",
        });
    }
    try {
        const result = await EmailService_1.emailService.createAndMonitorEmail(companyId);
        if (result.success) {
            res.status(200).json(result);
        }
        else {
            res.status(500).json(result);
        }
    }
    catch (error) {
        console.error("Erro no endpoint create-email:", error);
        res.status(500).json({
            success: false,
            message: "Erro interno do servidor",
        });
    }
});
/**
 * Endpoint para listar emails monitorados
 * GET /api/monitored-emails
 */
app.get("/api/monitored-emails", (req, res) => {
    const monitoredEmails = EmailService_1.emailService.getMonitoredEmails();
    res.json({
        count: monitoredEmails.length,
        emails: monitoredEmails,
    });
});
/**
 * Endpoint para listar emails recebidos de uma empresa
 * GET /api/received-emails/:companyId
 */
app.get("/api/received-emails/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    try {
        const emailAccount = await prisma_1.prisma.email.findFirst({
            where: { companyId: Number(companyId) },
        });
        if (!emailAccount) {
            return res.status(404).json({
                success: false,
                message: "Conta de email não encontrada para esta empresa",
            });
        }
        const receivedEmails = await prisma_1.prisma.receivedEmail.findMany({
            where: { emailId: emailAccount.id },
            orderBy: { createdAt: "desc" },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
            select: {
                id: true,
                fromEmail: true,
                toEmail: true,
                subject: true,
                textContent: true,
                htmlContent: true,
                attachments: true,
                metadata: true,
                createdAt: true,
            },
        });
        const total = await prisma_1.prisma.receivedEmail.count({
            where: { emailId: emailAccount.id },
        });
        res.json({
            success: true,
            data: receivedEmails,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit)),
            },
        });
    }
    catch (error) {
        console.error("Erro ao buscar emails recebidos:", error);
        res.status(500).json({
            success: false,
            message: "Erro interno do servidor",
        });
    }
});
/**
 * Endpoint para parar monitoramento de um email
 * POST /api/stop-monitoring/:companyId
 */
app.post("/api/stop-monitoring/:companyId", async (req, res) => {
    const { companyId } = req.params;
    try {
        const emailAccount = await prisma_1.prisma.email.findFirst({
            where: { companyId: Number(companyId) },
        });
        if (!emailAccount) {
            return res.status(404).json({
                success: false,
                message: "Conta de email não encontrada",
            });
        }
        await EmailService_1.emailService.stopMonitoring(emailAccount.email);
        res.json({
            success: true,
            message: `Monitoramento parado para ${emailAccount.email}`,
        });
    }
    catch (error) {
        console.error("Erro ao parar monitoramento:", error);
        res.status(500).json({
            success: false,
            message: "Erro interno do servidor",
        });
    }
});
/**
 * Endpoint de health check
 * GET /api/health
 */
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        monitoredEmails: EmailService_1.emailService.getMonitoredEmails().length,
    });
});
// Middleware de tratamento de erros
app.use((err, req, res, next) => {
    console.error("Erro não tratado:", err);
    res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
    });
});
// Middleware para rotas não encontradas
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Rota não encontrada",
    });
});
async function startServer() {
    try {
        // Inicia o monitoramento de todos os emails existentes
        console.log("🔄 Iniciando monitoramento dos emails existentes...");
        await EmailService_1.emailService.startAllMonitoring();
        // Inicia o servidor
        app.listen(config_1.config.server.port, () => {
            console.log(`🚀 Servidor rodando em http://localhost:${config_1.config.server.port}`);
            console.log(`📧 Sistema de monitoramento de emails ativo`);
        });
    }
    catch (error) {
        console.error("❌ Erro ao iniciar servidor:", error);
        process.exit(1);
    }
}
// Tratamento de sinais para graceful shutdown
process.on("SIGINT", () => {
    console.log("\n🛑 Recebido SIGINT, encerrando servidor...");
    process.exit(0);
});
process.on("SIGTERM", () => {
    console.log("\n🛑 Recebido SIGTERM, encerrando servidor...");
    process.exit(0);
});
// Inicia o servidor
startServer();
exports.default = app;
//# sourceMappingURL=server.js.map