import express, { Request, Response } from "express";
import { config } from "./config";
import { prisma } from "../prisma";
import { emailService } from "./services/EmailService";

const app = express();

// Middleware para parsing do JSON
app.use(express.json());

/**
 * Endpoint para criar email e iniciar monitoramento
 * POST /api/create-email/:companyId
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
 * Endpoint para listar emails monitorados
 * GET /api/monitored-emails
 */
app.get("/api/monitored-emails", (req: Request, res: Response) => {
  const monitoredEmails = emailService.getMonitoredEmails();
  res.json({
    count: monitoredEmails.length,
    emails: monitoredEmails,
  });
});

/**
 * Endpoint para listar emails recebidos de uma empresa
 * GET /api/received-emails/:companyId
 */
app.get(
  "/api/received-emails/:companyId",
  async (req: Request, res: Response) => {
    const { companyId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    try {
      const emailAccount = await prisma.email.findFirst({
        where: { companyId: Number(companyId) },
      });

      if (!emailAccount) {
        return res.status(404).json({
          success: false,
          message: "Conta de email não encontrada para esta empresa",
        });
      }

      const receivedEmails = await prisma.receivedEmail.findMany({
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

      const total = await prisma.receivedEmail.count({
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
    } catch (error) {
      console.error("Erro ao buscar emails recebidos:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
      });
    }
  }
);

/**
 * Endpoint para parar monitoramento de um email
 * POST /api/stop-monitoring/:companyId
 */
app.post(
  "/api/stop-monitoring/:companyId",
  async (req: Request, res: Response) => {
    const { companyId } = req.params;

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
 * Endpoint de health check
 * GET /api/health
 */
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    monitoredEmails: emailService.getMonitoredEmails().length,
  });
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
    await emailService.startAllMonitoring();

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

export default app;
