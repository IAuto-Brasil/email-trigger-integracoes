"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSwagger = setupSwagger;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Email Monitoring API",
            version: "1.0.0",
            description: "API para monitoramento e gerenciamento de emails",
        },
        servers: [
            {
                url: "https://email-trigger-app.q60ybw.easypanel.host",
            },
        ],
    },
    apis: ["./src/server.ts"], // aqui você pode apontar para outros arquivos de rotas
};
const swaggerSpec = (0, swagger_jsdoc_1.default)(options);
function setupSwagger(app) {
    app.use("/api-docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec));
    // opcional: rota para exportar JSON da doc
    app.get("/swagger.json", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.send(swaggerSpec);
    });
}
//# sourceMappingURL=swagger.js.map