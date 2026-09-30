"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Credit captured Razorpay payments that missed wallet top-up (idempotent).
 * Usage: npx tsx scripts/creditMissedRazorpayPayments.ts pay_xxx pay_yyy
 */
require("../config/bootstrapEnv");
const mongoose_1 = __importDefault(require("mongoose"));
const walletController_1 = require("../controllers/walletController");
async function main() {
    const ids = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
        console.error('Usage: npx tsx scripts/creditMissedRazorpayPayments.ts <paymentId>...');
        process.exit(1);
    }
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not set');
    }
    await mongoose_1.default.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
        family: 4,
    });
    try {
        for (const id of ids) {
            const result = await (0, walletController_1.creditRazorpayCapturedPayment)(id);
            console.log(JSON.stringify(result));
        }
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
void main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
