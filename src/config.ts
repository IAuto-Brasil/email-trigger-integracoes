export const config = {
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
};
