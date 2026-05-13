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
exports.REPORT_REASONS = void 0;
const mongoose_1 = __importStar(require("mongoose"));
exports.REPORT_REASONS = [
    'Spam',
    'Harassment',
    'Inappropriate content',
    'Fake profile',
    'Other',
    /** Caller post–voice-call issue (tags stored in `preview`). */
    'Call session issue',
];
const userReportSchema = new mongoose_1.Schema({
    reporterKind: { type: String, enum: ['user', 'receiver'], required: true },
    reporterId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    reportedKind: { type: String, enum: ['user', 'receiver'], required: true },
    reportedId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    reason: { type: String, enum: [...exports.REPORT_REASONS], required: true },
    preview: { type: String, default: '', trim: true, maxlength: 500 },
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending', index: true },
    resolution: {
        type: String,
        enum: ['ignored', 'warned', 'suspended', null],
        default: null,
    },
}, { timestamps: true });
userReportSchema.index({ status: 1, createdAt: -1 });
const UserReport = mongoose_1.default.model('UserReport', userReportSchema);
exports.default = UserReport;
