"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-time migration: legacy single `users` collection (with `role`) →
 * `users` (app members / callers only) + `receivers` (call receivers).
 *
 * Run from backend folder: npm run migrate:split-users
 * Requires MONGODB_URI. Stop the API server first.
 */
require("../config/bootstrapEnv");
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = __importDefault(require("../config/database"));
async function main() {
    await (0, database_1.default)();
    const db = mongoose_1.default.connection.db;
    if (!db) {
        throw new Error('No database handle');
    }
    const names = (await db.listCollections().toArray()).map((c) => c.name);
    if (names.includes('users_legacy')) {
        console.error('Collection users_legacy already exists. Aborting to avoid double migration.');
        process.exit(1);
    }
    if (!names.includes('users')) {
        console.log('No users collection found — nothing to migrate.');
        await mongoose_1.default.disconnect();
        process.exit(0);
    }
    const raw = db.collection('users');
    const sample = await raw.findOne({});
    if (!sample) {
        console.log('users collection is empty.');
        await mongoose_1.default.disconnect();
        process.exit(0);
    }
    if (!('role' in sample)) {
        console.log('Documents have no role field — database may already use split collections. Aborting.');
        await mongoose_1.default.disconnect();
        process.exit(0);
    }
    await raw.rename('users_legacy');
    console.log('Renamed collection users → users_legacy');
    const legacy = db.collection('users_legacy');
    const usersCol = db.collection('users');
    const receiversCol = db.collection('receivers');
    for await (const doc of legacy.find()) {
        const d = doc;
        const _id = d._id;
        const role = d.role;
        const base = {
            _id,
            name: String(d.name ?? '').trim(),
            email: String(d.email ?? '').toLowerCase().trim(),
            phone: String(d.phone ?? '').trim(),
            isVerified: Boolean(d.isVerified),
            otp: d.otp != null ? String(d.otp) : null,
            otpExpiry: d.otpExpiry instanceof Date ? d.otpExpiry : d.otpExpiry ? new Date(String(d.otpExpiry)) : null,
            accountStatus: d.accountStatus || 'pending_profile',
            profileImage: d.profileImage != null ? String(d.profileImage) : null,
            languages: Array.isArray(d.languages) ? d.languages.map(String) : [],
            interests: Array.isArray(d.interests) ? d.interests.map(String) : [],
            gender: d.gender != null ? d.gender : null,
            age: typeof d.age === 'number' ? d.age : d.age != null ? Number(d.age) : null,
            state: d.state != null ? String(d.state).trim() : null,
            passwordHash: d.passwordHash != null ? String(d.passwordHash) : null,
            suspended: false,
            walletBalance: 0,
            createdAt: d.createdAt instanceof Date ? d.createdAt : new Date(),
            updatedAt: d.updatedAt instanceof Date ? d.updatedAt : new Date(),
        };
        if (role === 'caller') {
            await usersCol.insertOne(base);
        }
        else {
            await receiversCol.insertOne({
                ...base,
                audioCallRate: null,
                documents: Array.isArray(d.documents) ? d.documents.map(String) : [],
                aadhaarFront: d.aadhaarFront != null ? String(d.aadhaarFront) : null,
                aadhaarBack: d.aadhaarBack != null ? String(d.aadhaarBack) : null,
                bankAccountHolderName: d.bankAccountHolderName != null ? String(d.bankAccountHolderName) : null,
                bankAccountType: d.bankAccountType === 'savings' || d.bankAccountType === 'current' ? d.bankAccountType : null,
                bankAccountNumber: d.bankAccountNumber != null ? String(d.bankAccountNumber) : null,
                bankIfsc: d.bankIfsc != null ? String(d.bankIfsc) : null,
                bankName: d.bankName != null ? String(d.bankName) : null,
            });
        }
    }
    const { default: User } = await Promise.resolve().then(() => __importStar(require('../models/User')));
    const { default: Receiver } = await Promise.resolve().then(() => __importStar(require('../models/Receiver')));
    const nCallers = await User.countDocuments();
    const nReceivers = await Receiver.countDocuments();
    console.log(`Done. users: ${nCallers}, receivers: ${nReceivers}`);
    await User.syncIndexes();
    await Receiver.syncIndexes();
    console.log('Indexes synced.');
    await mongoose_1.default.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
