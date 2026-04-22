"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-time: align legacy caller rows with suspended-only access after profile submit.
 * - pending_review + not suspended → approved + suspended (awaiting admin enable)
 * - rejected + not suspended → approved + suspended
 *
 * Run: npx tsx scripts/migrateCallerAccessSuspendedOnly.ts
 */
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = __importDefault(require("../models/User"));
dotenv_1.default.config();
async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is not set');
        process.exit(1);
    }
    await mongoose_1.default.connect(uri);
    const r1 = await User_1.default.updateMany({ accountStatus: 'pending_review', suspended: false }, { $set: { accountStatus: 'approved', suspended: true } });
    const r2 = await User_1.default.updateMany({ accountStatus: 'rejected', suspended: false }, { $set: { accountStatus: 'approved', suspended: true } });
    console.log('pending_review → approved+suspended:', r1.modifiedCount);
    console.log('rejected → approved+suspended:', r2.modifiedCount);
    await mongoose_1.default.disconnect();
}
void main().catch((e) => {
    console.error(e);
    process.exit(1);
});
