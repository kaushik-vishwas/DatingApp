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
const referralAlertSchema = new mongoose_1.Schema({
    type: { type: String, enum: ['duplicate_phone', 'burst'], required: true, index: true },
    referrerKind: { type: String, enum: ['user', 'receiver'], required: true },
    referrerId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    referrerPhone: { type: String, required: true, trim: true },
    referredPhoneKey: { type: String, default: '', trim: true },
    referralCode: { type: String, default: '', trim: true, uppercase: true },
    message: { type: String, required: true, trim: true, maxlength: 400 },
}, { timestamps: true });
referralAlertSchema.index({ createdAt: -1 });
referralAlertSchema.index({ referrerId: 1, type: 1, createdAt: -1 });
const ReferralAlert = mongoose_1.default.models.ReferralAlert ?? mongoose_1.default.model('ReferralAlert', referralAlertSchema);
exports.default = ReferralAlert;
