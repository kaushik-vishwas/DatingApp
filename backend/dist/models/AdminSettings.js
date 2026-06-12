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
const fixedWindowSchema = new mongoose_1.Schema({
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    ratePerMinute: { type: Number, required: true, min: 0 },
}, { _id: false });
const adminSettingsSchema = new mongoose_1.Schema({
    notificationControls: {
        kycSubmissionsEmail: { type: Boolean, default: true },
        pendingWithdrawalsEmail: { type: Boolean, default: true },
        dailyRevenueSummaryEmail: { type: Boolean, default: true },
    },
    receiverEarningModel: {
        type: String,
        enum: ['score_based', 'fixed_per_minute'],
        default: 'score_based',
    },
    fixedPerMinuteWindows: {
        type: [fixedWindowSchema],
        default: [],
    },
    receiverWelcome: {
        enabled: { type: Boolean, default: true },
        title: { type: String, default: 'Welcome to Selecto', trim: true, maxlength: 120 },
        body: { type: String, default: '', trim: true, maxlength: 3000 },
    },
    callerNotification: {
        enabled: { type: Boolean, default: true },
        title: { type: String, default: 'Announcement', trim: true, maxlength: 120 },
        body: { type: String, default: '', trim: true, maxlength: 3000 },
    },
    adminEarningsPayout: {
        upiId: { type: String, default: '', trim: true, maxlength: 256 },
        payeeName: { type: String, default: '', trim: true, maxlength: 120 },
        contactPhone: { type: String, default: '', trim: true, maxlength: 20 },
    },
}, { timestamps: true });
const AdminSettings = mongoose_1.default.model('AdminSettings', adminSettingsSchema);
exports.default = AdminSettings;
