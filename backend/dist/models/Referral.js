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
const referralSchema = new mongoose_1.Schema({
    referralCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    referrerKind: { type: String, enum: ['user', 'receiver'], required: true },
    referrerId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    referredKind: { type: String, enum: ['user', 'receiver'], required: true },
    referredId: { type: mongoose_1.Schema.Types.ObjectId, required: true },
    referredPhone: { type: String, required: true, trim: true },
    rewardInr: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['rewarded', 'rejected'], required: true, index: true },
    rejectReason: { type: String, default: null, trim: true, maxlength: 300 },
    rewardedAt: { type: Date, default: null },
    walletCreditKind: { type: String, enum: ['user', 'receiver'], default: null },
    walletCreditId: { type: mongoose_1.Schema.Types.ObjectId, default: null },
}, { timestamps: true });
referralSchema.index({ referredKind: 1, referredId: 1 }, { unique: true });
referralSchema.index({ referrerKind: 1, referrerId: 1, createdAt: -1 });
const Referral = mongoose_1.default.model('Referral', referralSchema);
exports.default = Referral;
