"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantCallerWelcomeFreeTalk = grantCallerWelcomeFreeTalk;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const WalletCredit_1 = __importDefault(require("../models/WalletCredit"));
const callerWelcomeFreeTalk_1 = require("../constants/callerWelcomeFreeTalk");
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
/**
 * One-time wallet credit for new callers (2 min × ₹/min rate).
 * Idempotent: skips if a welcome_free_talk credit already exists for this user.
 */
async function grantCallerWelcomeFreeTalk(userId) {
    const uid = String(userId ?? '').trim();
    if (!uid || !mongoose_1.default.Types.ObjectId.isValid(uid)) {
        return { granted: false, amountInr: 0, reason: 'invalid_user' };
    }
    const amountInr = roundInr(callerWelcomeFreeTalk_1.CALLER_WELCOME_FREE_TALK_INR);
    if (amountInr <= 0) {
        return { granted: false, amountInr: 0, reason: 'zero_amount' };
    }
    const existing = await WalletCredit_1.default.exists({
        userId: new mongoose_1.default.Types.ObjectId(uid),
        source: 'welcome_free_talk',
    });
    if (existing) {
        return { granted: false, amountInr, reason: 'already_granted' };
    }
    const session = await mongoose_1.default.startSession();
    try {
        let granted = false;
        await session.withTransaction(async () => {
            const dup = await WalletCredit_1.default.exists({
                userId: new mongoose_1.default.Types.ObjectId(uid),
                source: 'welcome_free_talk',
            }).session(session);
            if (dup)
                return;
            await WalletCredit_1.default.create([
                {
                    userId: new mongoose_1.default.Types.ObjectId(uid),
                    source: 'welcome_free_talk',
                    amountInr,
                    referralId: null,
                    description: `Welcome free talk — ${callerWelcomeFreeTalk_1.CALLER_WELCOME_FREE_TALK_MINUTES} min`,
                },
            ], { session });
            await User_1.default.updateOne({ _id: uid }, { $inc: { walletBalance: amountInr } }, { session });
            granted = true;
        });
        return { granted, amountInr, reason: granted ? undefined : 'already_granted' };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[welcome-free-talk] grant error:', msg);
        return { granted: false, amountInr, reason: 'error' };
    }
    finally {
        session.endSession();
    }
}
