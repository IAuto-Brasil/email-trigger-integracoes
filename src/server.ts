import express, { Request, Response } from "express";
import { config } from "./config";
import { prisma } from "../prisma";
import { emailService } from "./services/EmailService";
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

// receber um Authorization Bearer
app.post(
  "/api/create-email/:companyId",
  async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization header missing",
      });
    }

    if (
      authHeader !==
      "630f4367aa75d640ca95e5153142f3cb5f5a0421da5777b1095a0a59f2f30a50"
    ) {
      return res.status(401).json({
        success: false,
        message: "Authorization header invalid",
      });
    }

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
app.get("/api/monitored-emails", (req: Request, res: Response) => {
  const monitoredEmails = emailService.getMonitoredEmails();
  res.json({
    count: monitoredEmails.length,
    emails: monitoredEmails,
  });
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

    console.log("Modo:" + process.env.MODE);
    console.log(
      "ENDPOINT:" +
        (process.env.MODE === "dev"
          ? process.env.DEV_ENDPOINT
          : process.env.PROD_ENDPOINT)
    );

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
