"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    cpanel: {
        host: "https://iautobrasil.com:2083",
        user: "iautob75", // mesmo usuário do token
        token: "6TWQ52PS7RLEI52V12UZ5W8OC156BZ89",
        domain: "iautobrasil.com",
    },
    server: {
        port: 3000,
    },
    defaultPwd: "IAuto@2025@EmailsDomain",
    rabbitmq: {
        host: "amqp://email-trigger-rabbitmq.q60ybw.easypanel.host:5672",
        port: 5672,
        user: "IAutoBrasil",
        password: "IAuto@2025",
    },
    postgresql: {
        host: "31.97.164.128",
        port: 5433,
        user: "postgres",
        password: "IAuto@2025@PostgreSQL",
        database: "email_trigger",
        url: "postgres://postgres:IAuto@2025@PostgreSQL@31.97.164.128:5433/email_trigger?sslmode=disable",
    },
};
//# sourceMappingURL=config.js.map