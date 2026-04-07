import express, { Request, Response } from "express";
import { config } from "./config";
import { prisma } from "../prisma";
import { emailService } from "./services/email-service";
import { setupSwagger } from "./swagger";
import "dotenv/config";

const app = express();

// Middleware para parsing do JSON
app.use(express.json());
setupSwagger(app);

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
 *           type: integer
 *         description: ID da empresa
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

app.post(
  "/api/create-email/:companyId",
  async (req: Request, res: Response) => {
    const { companyId } = req.params;

    // Validação básica
    if (!companyId || isNaN(Number(companyId))) {
      return res.status(400).json({
        success: false,
        message: "ID da empresa inválido",
      });
    }

    try {
      const result = await emailService.createAndMonitorEmail(companyId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error("Erro no endpoint create-email:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
      });
    }
  }
);

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
app.get("/api/monitored-emails", async (req: Request, res: Response) => {
  try {
    const monitoredEmails = await emailService.getMonitoredEmails();
    res.json({
      count: monitoredEmails.length,
      emails: monitoredEmails,
    });
  } catch (error) {
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
 *           type: integer
 *         description: ID da empresa
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
app.post(
  "/api/stop-monitoring/:companyId",
  async (req: Request, res: Response) => {
    const { companyId } = req.params;

    if (!companyId || Number.isNaN(Number(companyId))) {
      return res.status(400).json({
        success: false,
        message: "ID da empresa inválido",
      });
    }

    try {
      const emailAccount = await prisma.email.findFirst({
        where: { companyId: Number(companyId) },
      });

      if (!emailAccount) {
        return res.status(404).json({
          success: false,
          message: "Conta de email não encontrada",
        });
      }

      await emailService.stopMonitoring(emailAccount.email);

      res.json({
        success: true,
        message: `Monitoramento parado para ${emailAccount.email}`,
      });
    } catch (error) {
      console.error("Erro ao parar monitoramento:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
      });
    }
  }
);

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
app.get("/api/monitoring-stats", async (req: Request, res: Response) => {
  try {
    const stats = await emailService.getStats();
    res.json(stats);
  } catch (error) {
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
app.post("/api/trigger-monitoring", async (req: Request, res: Response) => {
  try {
    // Executa o ciclo sem aguardar (async)
    emailService.runMonitoringCycle();

    res.json({
      success: true,
      message: "Ciclo de monitoramento disparado",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
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
 */
app.get("/api/health", async (req: Request, res: Response) => {
  try {
    const stats = await emailService.getStats();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      monitoringStats: stats,
    });
  } catch (error) {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      monitoringStats: null,
    });
  }
});

// Middleware de tratamento de erros
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error("Erro não tratado:", err);
  res.status(500).json({
    success: false,
    message: "Erro interno do servidor",
  });
});

// Middleware para rotas não encontradas
app.use((req: Request, res: Response) => {
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
    const scheduleMinutes =
      Number.isFinite(rawSchedule) && rawSchedule > 0 ? rawSchedule : 1;
    if (rawSchedule !== scheduleMinutes) {
      console.warn(
        `SCHEDULE_TIME_IN_MINUTES inválido ou ausente; usando ${scheduleMinutes} min.`
      );
    }
    emailService.startScheduledMonitoring(scheduleMinutes);

    // Inicia o servidor
    app.listen(config.server.port, () => {
      console.log(
        `🚀 Servidor rodando em http://localhost:${config.server.port}`
      );
      console.log(`📧 Sistema de monitoramento de emails ativo`);
    });
  } catch (error) {
    console.error("❌ Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  console.log(`\n🛑 Recebido ${signal}, encerrando servidor...`);
  try {
    emailService.stopScheduledMonitoring();
    await prisma.$disconnect();
  } catch (e) {
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

// Inicia o servidor
startServer();
