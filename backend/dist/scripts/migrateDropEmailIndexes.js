"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-time: drop legacy email_1 unique indexes on users/receivers (phone-only auth).
 *
 * Run: npx tsx scripts/migrateDropEmailIndexes.ts
 */
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const dropLegacyEmailIndexes_1 = require("../services/dropLegacyEmailIndexes");
dotenv_1.default.config();
async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is not set');
        process.exit(1);
    }
    await mongoose_1.default.connect(uri);
    await (0, dropLegacyEmailIndexes_1.dropLegacyEmailIndexes)();
    await mongoose_1.default.disconnect();
    console.log('Done.');
}
void main().catch((e) => {
    console.error(e);
    process.exit(1);
});
