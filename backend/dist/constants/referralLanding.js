"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReferralLandingBaseUrl = getReferralLandingBaseUrl;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let cachedBaseUrl = null;
/** Change URL in repo root `config/referralLanding.json` (or set REFERRAL_SHARE_BASE_URL on server). */
function getReferralLandingBaseUrl() {
    if (cachedBaseUrl)
        return cachedBaseUrl;
    const fromEnv = process.env.REFERRAL_SHARE_BASE_URL?.trim();
    if (fromEnv) {
        cachedBaseUrl = fromEnv.replace(/\/+$/, '');
        return cachedBaseUrl;
    }
    const candidates = [
        path_1.default.join(__dirname, '..', 'config', 'referralLanding.json'),
        path_1.default.join(__dirname, '..', '..', 'config', 'referralLanding.json'),
        path_1.default.join(process.cwd(), 'config', 'referralLanding.json'),
        path_1.default.join(process.cwd(), '..', 'config', 'referralLanding.json'),
    ];
    for (const filePath of candidates) {
        try {
            if (!fs_1.default.existsSync(filePath))
                continue;
            const raw = JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
            const url = String(raw.referralLandingBaseUrl ?? '').trim();
            if (url) {
                cachedBaseUrl = url.replace(/\/+$/, '');
                return cachedBaseUrl;
            }
        }
        catch {
            /* try next path */
        }
    }
    throw new Error('referralLandingBaseUrl not configured. Set config/referralLanding.json or REFERRAL_SHARE_BASE_URL.');
}
