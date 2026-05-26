"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RECEIVER_WELCOME_TITLE = void 0;
exports.normalizeReceiverWelcome = normalizeReceiverWelcome;
exports.getReceiverWelcomeSettings = getReceiverWelcomeSettings;
const AdminSettings_1 = __importDefault(require("../models/AdminSettings"));
exports.DEFAULT_RECEIVER_WELCOME_TITLE = 'Welcome to Selecto';
function normalizeReceiverWelcome(raw) {
    const title = String(raw?.title ?? exports.DEFAULT_RECEIVER_WELCOME_TITLE).trim() || exports.DEFAULT_RECEIVER_WELCOME_TITLE;
    const body = String(raw?.body ?? '').trim();
    return {
        enabled: raw?.enabled !== false,
        title: title.slice(0, 120),
        body: body.slice(0, 3000),
    };
}
async function getReceiverWelcomeSettings() {
    const settings = await AdminSettings_1.default.findOne({}).select('receiverWelcome').lean();
    return normalizeReceiverWelcome(settings?.receiverWelcome);
}
