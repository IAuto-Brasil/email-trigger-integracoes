"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const prisma_1 = require("../prisma");
const email_service_1 = require("./services/email-service");
const swagger_1 = require("./swagger");
const company_id_1 = require("./utils/company-id");
require("dotenv/config");
const app = (0, express_1.default)();
// Middleware para parsing do JSON
app.use(express_1.default.json());
(0, swagger_1.setupSwagger)(app);
/**
 * @swagger
 * /api/create-email/{companyId}:
 *   post:
 *     summary: Cria email e inicia monitoramento
 *     tags:
 *       - Emails
 *     description: Cria uma conta de email para a empresa e inicia o monitoramento.
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *           example: "b69bc8b5"
 *         description: ID da empresa (número ou slug/UUID na parte local do e-mail)
 *     responses:
 *       200:
 *         description: Email criado e monitorado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Email criado e monitoramento iniciado com sucesso"
 *                 email:
 *                   type: string
 *                   example: "exemplo@empresa.com"
 *       400:
 *         description: ID da empresa inválido
 */
app.post("/api/create-email/:companyId", async (req, res) => {
    const companyId = (0, company_id_1.parseCompanyIdParam)(req.params.companyId);
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "ID da empresa inválido (use até 64 caracteres: letras, números, . _ -)",
        });
    }
    try {
        const result = await email_service_1.emailService.createAndMonitorEmail(companyId);
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
 * @swagger
 * /api/monitored-emails:
 *   get:
 *     summary: Lista os emails que estão sendo monitorados
 *     tags:
 *       - Emails
 *     responses:
 *       200:
 *         description: Lista de emails monitorados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 emails:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "email1@iautobrasil.com"
 *                     - "email2@iautobrasil.com"
 */
app.get("/api/monitored-emails", async (req, res) => {
    try {
        const monitoredEmails = await email_service_1.emailService.getMonitoredEmails();
        res.json({
            count: monitoredEmails.length,
            emails: monitoredEmails,
        });
    }
    catch (error) {
        console.error("Erro ao listar e-mails monitorados:", error);
        res.status(500).json({
            success: false,
            message: "Erro ao listar e-mails monitorados",
        });
    }
});
/**
 * @swagger
 * /api/stop-monitoring/{companyId}:
 *   post:
 *     summary: Para o monitoramento de um email
 *     tags:
 *       - Emails
 *     description: Para o monitoramento de um email específico.
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *           example: "b69bc8b5"
 *         description: ID da empresa (número ou slug/UUID na parte local do e-mail)
 *     responses:
 *       200:
 *         description: Monitoramento parado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Monitoramento parado com sucesso"
 *       400:
 *         description: ID da empresa inválido
 */
app.post("/api/stop-monitoring/:companyId", async (req, res) => {
    const companyId = (0, company_id_1.parseCompanyIdParam)(req.params.companyId);
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "ID da empresa inválido (use até 64 caracteres: letras, números, . _ -)",
        });
    }
    try {
        const emailAccount = await prisma_1.prisma.email.findFirst({
            where: { companyId },
        });
        if (!emailAccount) {
            return res.status(404).json({
                success: false,
                message: "Conta de email não encontrada",
            });
        }
        await email_service_1.emailService.stopMonitoring(emailAccount.email);
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
 * @swagger
 * /api/monitoring-stats:
 *   get:
 *     summary: Retorna estatísticas do monitoramento
 *     tags:
 *       - Emails
 *     responses:
 *       200:
 *         description: Estatísticas do sistema
 */
app.get("/api/monitoring-stats", async (req, res) => {
    try {
        const stats = await email_service_1.emailService.getStats();
        res.json(stats);
    }
    catch (error) {
        console.error("Erro ao obter estatísticas:", error);
        res.status(500).json({
            success: false,
            message: "Erro interno do servidor",
        });
    }
});
/**
 * @swagger
 * /api/trigger-monitoring:
 *   post:
 *     summary: Dispara um ciclo de monitoramento manualmente
 *     tags:
 *       - Emails
 *     responses:
 *       200:
 *         description: Ciclo disparado
 */
app.post("/api/trigger-monitoring", async (req, res) => {
    try {
        // Executa o ciclo sem aguardar (async)
        email_service_1.emailService.runMonitoringCycle();
        res.json({
            success: true,
            message: "Ciclo de monitoramento disparado",
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error("Erro ao disparar monitoramento:", error);
        res.status(500).json({
            success: false,
            message: "Erro interno do servidor",
        });
    }
});
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Verifica o status do servidor
 *     tags:
 *       - Health
 *     description: Retorna o status atual do servidor, incluindo o número de emails sendo monitorados.
 *     responses:
 *       200:
 *         description: Status do servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-05-15T12:34:56.789Z"
 *                 monitoredEmails:
 *                   type: integer
 *                   example: 2
 *                 lastEmailCheckAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   description: Quando terminou o último ciclo de verificação IMAP
 */
app.get("/api/health", async (req, res) => {
    try {
        const stats = await email_service_1.emailService.getStats();
        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            lastEmailCheckAt: email_service_1.emailService.getLastEmailCheckAtIso(),
            monitoringStats: stats,
        });
    }
    catch (error) {
        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            lastEmailCheckAt: email_service_1.emailService.getLastEmailCheckAtIso(),
            monitoringStats: null,
        });
    }
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
        const rawSchedule = Number(process.env.SCHEDULE_TIME_IN_MINUTES);
        const scheduleMinutes = Number.isFinite(rawSchedule) && rawSchedule > 0 ? rawSchedule : 1;
        if (rawSchedule !== scheduleMinutes) {
            console.warn(`SCHEDULE_TIME_IN_MINUTES inválido ou ausente; usando ${scheduleMinutes} min.`);
        }
        email_service_1.emailService.startScheduledMonitoring(scheduleMinutes);
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
async function shutdown(signal) {
    console.log(`\n🛑 Recebido ${signal}, encerrando servidor...`);
    try {
        email_service_1.emailService.stopScheduledMonitoring();
        await prisma_1.prisma.$disconnect();
    }
    catch (e) {
        console.error("Erro no encerramento:", e);
    }
    process.exit(0);
}
process.on("SIGINT", () => {
    void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
});
process.on("unhandledRejection", (reason, p) => {
    console.error("⚠️ unhandledRejection (processo continua):", {
        at: p,
        reason,
    });
});
process.on("uncaughtException", (err) => {
    console.error("⚠️ uncaughtException (processo continua se possível):", err);
});
// Inicia o servidor
void startServer();
//# sourceMappingURL=server.js.map