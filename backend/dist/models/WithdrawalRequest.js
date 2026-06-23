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
const mongoose_1 = __importStar(require("mongoose"));
const withdrawalRequestSchema = new mongoose_1.Schema({
    receiverId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    platformFee: { type: Number, default: 0, min: 0 },
    payoutAmount: { type: Number, default: 0, min: 0 },
    payoutMethod: { type: String, enum: ['upi', 'bank'], default: null },
    status: {
        type: String,
        enum: ['verification_pending', 'pending', 'approved', 'rejected'],
        default: 'verification_pending',
        index: true,
    },
    verificationCodeHash: { type: String, default: null },
    verificationExpiresAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedByAdminId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Admin', default: null },
    adminNote: { type: String, default: null, trim: true, maxlength: 300 },
    bankName: { type: String, required: true, trim: true },
    accountHolderName: { type: String, required: true, trim: true },
    accountMasked: { type: String, required: true, trim: true },
    payoutStatus: {
        type: String,
        enum: ['none', 'processing', 'success', 'failed'],
        default: 'none',
        index: true,
    },
    payoutId: { type: String, default: null, trim: true },
    payoutUtr: { type: String, default: null, trim: true },
    payoutError: { type: String, default: null, trim: true, maxlength: 2000 },
    payoutReferenceId: { type: String, default: null, trim: true, maxlength: 60 },
    walletRefundedAt: { type: Date, default: null },
    walletDebitedAt: { type: Date, default: null },
}, { timestamps: true });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ receiverId: 1, createdAt: -1 });
const WithdrawalRequest = mongoose_1.default.model('WithdrawalRequest', withdrawalRequestSchema);
exports.default = WithdrawalRequest;
