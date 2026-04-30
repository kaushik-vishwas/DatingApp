"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toStreamUserId = toStreamUserId;
exports.createStreamUserToken = createStreamUserToken;
exports.getStreamApiKey = getStreamApiKey;
exports.buildVoiceCallId = buildVoiceCallId;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const STREAM_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
function getStreamConfig() {
    const apiKey = (process.env.STREAM_API_KEY ?? '').trim();
    const apiSecret = (process.env.STREAM_API_SECRET ?? '').trim();
    if (!apiKey || !apiSecret) {
        throw new Error('Stream is not configured on server');
    }
    return { apiKey, apiSecret };
}
function toStreamUserId(accountKind, accountId) {
    return `${accountKind === 'user' ? 'u' : 'r'}_${accountId}`;
}
function createStreamUserToken(streamUserId) {
    const { apiSecret } = getStreamConfig();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + STREAM_TOKEN_TTL_SECONDS;
    const token = jsonwebtoken_1.default.sign({
        user_id: streamUserId,
        iat: now,
        exp,
    }, apiSecret, { algorithm: 'HS256' });
    return { token, expiresAt: new Date(exp * 1000).toISOString() };
}
function getStreamApiKey() {
    return getStreamConfig().apiKey;
}
function buildVoiceCallId(a, b) {
    const [left, right] = [a, b].sort();
    // Stream call IDs must stay <= 64 chars; keep compact while preserving uniqueness.
    const pairHash = crypto_1.default.createHash('sha1').update(`${left}|${right}`).digest('hex').slice(0, 12);
    const nonce = crypto_1.default.randomBytes(8).toString('hex');
    return `v_${pairHash}_${nonce}`;
}
