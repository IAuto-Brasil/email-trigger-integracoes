import "dotenv/config";

function readIntInRange(
  envName: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = process.env[envName];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export const config = {
  /** Webhook Discord; se vazio, notificações Discord são ignoradas. */
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
  receiveLeadUrl:
    process.env.RECEIVE_LEAD_URL ??
    "https://wqpcgwftvdphmxwfbpln.supabase.co/functions/v1/receive-email-lead",
  cpanel: {
    host: process.env.CPANEL_HOST!,
    user: process.env.CPANEL_USER!,
    token: process.env.CPANEL_TOKEN!,
    domain: process.env.CPANEL_DOMAIN!,
  },
  server: {
    port: Number(process.env.SERVER_PORT) || 3000,
  },
  defaultPwd: process.env.DEFAULT_PWD!,
  rabbitmq: {
    host: process.env.RABBITMQ_HOST!,
    port: Number(process.env.RABBITMQ_PORT) || 5672,
    user: process.env.RABBITMQ_USER!,
    password: process.env.RABBITMQ_PASSWORD!,
  },
  postgresql: {
    host: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DB!,
    url: process.env.DATABASE_URL!,
  },
  endpoints: {
    dev: process.env.DEV_ENDPOINT!,
    prod: process.env.PROD_ENDPOINT!,
  },
  /**
   * Monitoramento IMAP (tudo opcional; defaults seguros para 24/7).
   * IMAP_PER_ACCOUNT_TIMEOUT_MS — máximo por conta por ciclo.
   * IMAP_FULL_CYCLE_RETRIES — quantas passagens completas após falha “de rede”.
   * IMAP_CONNECT_MAX_ATTEMPTS — retentativas de connect na mesma passagem.
   */
  monitoring: {
    perAccountImapTimeoutMs: readIntInRange(
      "IMAP_PER_ACCOUNT_TIMEOUT_MS",
      20 * 60 * 1000,
      60_000,
      2 * 60 * 60 * 1000
    ),
    imapFullCycleRetryMax: readIntInRange(
      "IMAP_FULL_CYCLE_RETRIES",
      2,
      1,
      5
    ),
    imapFullCycleRetryDelayMs: readIntInRange(
      "IMAP_FULL_CYCLE_RETRY_DELAY_MS",
      4_000,
      500,
      120_000
    ),
    imapConnectMaxAttempts: readIntInRange(
      "IMAP_CONNECT_MAX_ATTEMPTS",
      4,
      1,
      10
    ),
    imapConnectBaseDelayMs: readIntInRange(
      "IMAP_CONNECT_BASE_DELAY_MS",
      2_000,
      500,
      120_000
    ),
  },
};
