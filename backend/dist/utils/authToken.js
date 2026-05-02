"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAppAccessToken = signAppAccessToken;
exports.getPayloadSessionVersion = getPayloadSessionVersion;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function signAppAccessToken(userId, typ, sessionVersion) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not set in environment');
    }
    const sv = Math.floor(sessionVersion);
    return jsonwebtoken_1.default.sign({ id: userId, typ, sv }, secret, { expiresIn: '7d' });
}
/** Tokens issued before session versioning use implicit sv 0. */
function getPayloadSessionVersion(payload) {
    return typeof payload.sv === 'number' && Number.isFinite(payload.sv) ? payload.sv : 0;
}
