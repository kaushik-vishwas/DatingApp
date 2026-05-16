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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN = void 0;
const mongoose_1 = __importStar(require("mongoose"));
exports.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN = 5;
const receiverSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    isVerified: { type: Boolean, default: false },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
    accountStatus: {
        type: String,
        enum: ['pending_profile', 'pending_review', 'approved', 'rejected'],
        default: 'pending_profile',
    },
    profileImage: { type: String, default: null },
    documents: { type: [String], default: [] },
    aadhaarFront: { type: String, default: null },
    aadhaarBack: { type: String, default: null },
    aadhaarNumber: { type: String, default: null },
    panNumber: { type: String, default: null },
    panFront: { type: String, default: null },
    bankAccountHolderName: { type: String, default: null },
    bankAccountType: { type: String, enum: ['savings', 'current'], default: null },
    bankAccountNumber: { type: String, default: null },
    bankIfsc: { type: String, default: null },
    bankName: { type: String, default: null },
    languages: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    gender: { type: String, enum: ['male', 'female', 'other'], default: null },
    age: { type: Number, default: null },
    state: { type: String, default: null, trim: true },
    passwordHash: { type: String, default: null, select: false },
    audioCallRate: { type: Number, default: exports.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN },
    userAudio: { type: String, default: null },
    walletBalance: { type: Number, default: 0 },
    suspended: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
    isOnline: { type: Boolean, default: false },
    moderationWarningAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    pendingBankAccountHolderName: { type: String, default: null },
    pendingBankAccountType: { type: String, enum: ['savings', 'current'], default: null },
    pendingBankAccountNumber: { type: String, default: null },
    pendingBankIfsc: { type: String, default: null },
    pendingBankName: { type: String, default: null },
    cumulativeScore: { type: Number, default: 0, min: 0 },
    cumulativeValidCallMinutes: { type: Number, default: 0, min: 0 },
    badgeLevel: { type: String, enum: ['platinum', 'diamond', 'supreme'], default: 'platinum' },
    earningRatePerMinute: { type: Number, default: 2.0, min: 0 },
    onlineSince: { type: Date, default: null },
    authSessionVersion: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
const Receiver = mongoose_1.default.model('Receiver', receiverSchema);
exports.default = Receiver;
