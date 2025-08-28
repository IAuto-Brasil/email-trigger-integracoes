"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = processEmail;
const chavesnamao_1 = __importDefault(require("./chavesnamao"));
const icarros_1 = __importDefault(require("./icarros"));
function processEmail(email) {
    console.log(email);
    const portalDomain = email.from?.split("@")[1] || "";
    if (portalDomain.includes("icarros")) {
        return (0, icarros_1.default)(email);
    }
    if (portalDomain.includes("chavesnamao")) {
        return (0, chavesnamao_1.default)(email);
    }
    return null;
}
//# sourceMappingURL=index.js.map