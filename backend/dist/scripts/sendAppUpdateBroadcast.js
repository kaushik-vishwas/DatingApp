"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-shot: push "please update Selecto from Play Store" to all callers + receivers
 * that have an Expo push token.
 *
 * Uses Expo Push only — does not call FCM / incoming-call wake code.
 *
 *   npx tsx scripts/sendAppUpdateBroadcast.ts
 */
require("../config/bootstrapEnv");
const database_1 = __importDefault(require("../config/database"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const expoBroadcastPush_1 = require("../services/expoBroadcastPush");
const TITLE = 'Urgent: Update Selecto';
const BODY = 'A critical update is available on Play Store. Please open Play Store → Selecto → Update now for proper payments and calls.';
async function main() {
    await (0, database_1.default)();
    const [callerRows, receiverRows] = await Promise.all([
        User_1.default.find({ expoPushToken: { $type: 'string', $ne: '' } })
            .select('expoPushToken')
            .lean(),
        Receiver_1.default.find({ expoPushToken: { $type: 'string', $ne: '' } })
            .select('expoPushToken')
            .lean(),
    ]);
    const callerTokens = callerRows.map((r) => String(r.expoPushToken ?? ''));
    const receiverTokens = receiverRows.map((r) => String(r.expoPushToken ?? ''));
    console.log(`Callers with Expo token: ${callerTokens.filter((t) => t.startsWith('ExponentPushToken')).length}`);
    console.log(`Receivers with Expo token: ${receiverTokens.filter((t) => t.startsWith('ExponentPushToken')).length}`);
    const callerResult = await (0, expoBroadcastPush_1.sendExpoBroadcastPush)(callerTokens, {
        title: TITLE,
        body: BODY,
        data: { audience: 'caller' },
    });
    console.log('Caller broadcast:', callerResult);
    const receiverResult = await (0, expoBroadcastPush_1.sendExpoBroadcastPush)(receiverTokens, {
        title: TITLE,
        body: BODY,
        data: { audience: 'receiver' },
    });
    console.log('Receiver broadcast:', receiverResult);
    console.log('Done. FCM incoming-call path was not used.');
    process.exit(0);
}
void main().catch((err) => {
    console.error(err);
    process.exit(1);
});
