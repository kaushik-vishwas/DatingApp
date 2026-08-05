"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.otpBypassEnabled = otpBypassEnabled;
const loadEnv_1 = require("../config/loadEnv");
let envEnsured = false;
function ensureEnvLoaded() {
    if (envEnsured)
        return;
    (0, loadEnv_1.loadEnv)();
    envEnsured = true;
}
/**
 * Dev-only: when `OTP_BYPASS=true` in backend/.env, skip SMS and accept any OTP.
 * Trims value so Windows CRLF / trailing spaces cannot silently disable bypass.
 */
function otpBypassEnabled() {
    ensureEnvLoaded();
    const raw = process.env.OTP_BYPASS;
    if (raw == null)
        return false;
    const v = String(raw).trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
}
