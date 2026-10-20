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
const RETENTION_SECONDS = 30 * 24 * 60 * 60;
const callRingEventSchema = new mongoose_1.Schema({
    callId: { type: String, required: true, trim: true },
    receiverId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Receiver', required: true },
    outcome: { type: String, enum: ['acked', 'suppressed', 'no_ack'], required: true },
    unreachable_reason: { type: String, enum: ['busy', 'ui_disabled', 'no_ack', null], default: null },
    ackAfterMs: { type: Number, default: null },
    lastClient: {
        type: new mongoose_1.Schema({
            mfr: { type: String, default: '' },
            model: { type: String, default: '' },
            os: { type: String, default: '' },
            sdk: { type: Number, default: null },
            appVersionCode: { type: Number, default: null },
            seenAt: { type: Date, required: true },
        }, { _id: false }),
        default: null,
    },
    lateDeclineAt: { type: Date, default: null },
    createdAt: { type: Date, default: () => new Date() },
}, { versionKey: false });
callRingEventSchema.index({ callId: 1 }, { unique: true });
callRingEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
callRingEventSchema.index({ outcome: 1, 'lastClient.mfr': 1, createdAt: -1 });
callRingEventSchema.index({ receiverId: 1, createdAt: -1 });
const CallRingEvent = mongoose_1.default.model('CallRingEvent', callRingEventSchema);
exports.default = CallRingEvent;
