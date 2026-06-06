"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CALLER_NOTIFICATION_TITLE = void 0;
exports.normalizeCallerNotification = normalizeCallerNotification;
exports.getCallerNotificationSettings = getCallerNotificationSettings;
const AdminSettings_1 = __importDefault(require("../models/AdminSettings"));
exports.DEFAULT_CALLER_NOTIFICATION_TITLE = 'Announcement';
function normalizeCallerNotification(raw) {
    const title = String(raw?.title ?? exports.DEFAULT_CALLER_NOTIFICATION_TITLE).trim() ||
        exports.DEFAULT_CALLER_NOTIFICATION_TITLE;
    const body = String(raw?.body ?? '').trim();
    return {
        enabled: raw?.enabled !== false,
        title: title.slice(0, 120),
        body: body.slice(0, 3000),
    };
}
async function getCallerNotificationSettings() {
    const settings = await AdminSettings_1.default.findOne({}).select('callerNotification').lean();
    return normalizeCallerNotification(settings?.callerNotification);
}
