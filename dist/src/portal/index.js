"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = processEmail;
const process_email_with_chat_gpt_1 = __importDefault(require("./process-email-with-chat-gpt"));
async function processEmail(email) {
    try {
        return await (0, process_email_with_chat_gpt_1.default)(email);
    }
    catch (error) {
        console.error("❌ Erro ao processar email:", error);
        return null;
    }
}
//# sourceMappingURL=index.js.map