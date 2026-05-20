"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CALLER_MESSAGE_MIN_DURATION_SEC = void 0;
exports.callerHasSuccessfulCallWithReceiver = callerHasSuccessfulCallWithReceiver;
const mongoose_1 = __importDefault(require("mongoose"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
/** Minimum connected seconds to count as a successful call (matches caller call-history UI). */
exports.CALLER_MESSAGE_MIN_DURATION_SEC = 15;
async function callerHasSuccessfulCallWithReceiver(callerId, receiverId) {
    const uid = callerId instanceof mongoose_1.default.Types.ObjectId
        ? callerId
        : new mongoose_1.default.Types.ObjectId(String(callerId));
    const rid = receiverId instanceof mongoose_1.default.Types.ObjectId
        ? receiverId
        : new mongoose_1.default.Types.ObjectId(String(receiverId));
    if (!mongoose_1.default.Types.ObjectId.isValid(String(uid)) || !mongoose_1.default.Types.ObjectId.isValid(String(rid))) {
        return false;
    }
    const row = await CallSession_1.default.exists({
        callerId: uid,
        receiverId: rid,
        status: 'completed',
        durationSec: { $gte: exports.CALLER_MESSAGE_MIN_DURATION_SEC },
    });
    return Boolean(row);
}
