"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cascadeDeleteReceiverAccount = cascadeDeleteReceiverAccount;
exports.cascadeDeleteUserAccount = cascadeDeleteUserAccount;
const mongoose_1 = __importDefault(require("mongoose"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const ChatMessage_1 = __importDefault(require("../models/ChatMessage"));
const ChatReadState_1 = __importDefault(require("../models/ChatReadState"));
const CallerAppStoreReview_1 = __importDefault(require("../models/CallerAppStoreReview"));
const CallerOnlineNotification_1 = __importDefault(require("../models/CallerOnlineNotification"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const ReceiverAvailabilityNotification_1 = __importDefault(require("../models/ReceiverAvailabilityNotification"));
const ReceiverDailyScore_1 = __importDefault(require("../models/ReceiverDailyScore"));
const ReceiverPriorityNotification_1 = __importDefault(require("../models/ReceiverPriorityNotification"));
const ReceiverRating_1 = __importDefault(require("../models/ReceiverRating"));
const ReceiverWalletCredit_1 = __importDefault(require("../models/ReceiverWalletCredit"));
const Referral_1 = __importDefault(require("../models/Referral"));
const User_1 = __importDefault(require("../models/User"));
const UserReport_1 = __importDefault(require("../models/UserReport"));
const WalletCredit_1 = __importDefault(require("../models/WalletCredit"));
const WalletTopup_1 = __importDefault(require("../models/WalletTopup"));
const WithdrawalRequest_1 = __importDefault(require("../models/WithdrawalRequest"));
const receiverPresence_1 = require("./receiverPresence");
const callQueue_1 = require("./callQueue");
function asObjectId(id) {
    return new mongoose_1.default.Types.ObjectId(String(id).trim());
}
/**
 * Deletes all Mongo rows tied to a receiver, then the Receiver document.
 * Does not touch unrelated callers/receivers (array refs are $pull'd).
 */
async function cascadeDeleteReceiverAccount(receiverId) {
    const rid = asObjectId(receiverId);
    const idStr = String(rid);
    // In-memory runtime presence / queue (safe no-ops if absent).
    try {
        (0, receiverPresence_1.clearReceiverDiscoverGrace)(idStr);
        (0, callQueue_1.releaseReceiverReservation)(idStr);
        (0, callQueue_1.removeReceiverFromQueue)(idStr);
    }
    catch {
        // ignore
    }
    await Promise.all([
        ChatMessage_1.default.deleteMany({ receiverId: rid }),
        ChatBlock_1.default.deleteMany({ receiverId: rid }),
        ChatReadState_1.default.deleteMany({ receiverId: rid }),
        CallSession_1.default.deleteMany({ receiverId: rid }),
        WithdrawalRequest_1.default.deleteMany({ receiverId: rid }),
        ReceiverWalletCredit_1.default.deleteMany({ receiverId: rid }),
        ReceiverDailyScore_1.default.deleteMany({ receiverId: rid }),
        ReceiverRating_1.default.deleteMany({ receiverId: rid }),
        CallerOnlineNotification_1.default.deleteMany({ receiverId: rid }),
        ReceiverPriorityNotification_1.default.deleteMany({ receiverId: rid }),
        UserReport_1.default.deleteMany({
            $or: [
                { reporterKind: 'receiver', reporterId: rid },
                { reportedKind: 'receiver', reportedId: rid },
            ],
        }),
        Referral_1.default.deleteMany({
            $or: [
                { referrerKind: 'receiver', referrerId: rid },
                { referredKind: 'receiver', referredId: rid },
            ],
        }),
        ReceiverAvailabilityNotification_1.default.updateMany({ receiverIds: rid }, { $pull: { receiverIds: rid } }),
    ]);
    // Drop empty availability notification shells left after $pull.
    await ReceiverAvailabilityNotification_1.default.deleteMany({ receiverIds: { $size: 0 } });
    await Receiver_1.default.deleteOne({ _id: rid });
}
/**
 * Deletes all Mongo rows tied to a caller (User), then the User document.
 * Does not touch unrelated receivers (array refs are $pull'd).
 */
async function cascadeDeleteUserAccount(userId) {
    const uid = asObjectId(userId);
    await Promise.all([
        ChatMessage_1.default.deleteMany({ userId: uid }),
        ChatBlock_1.default.deleteMany({ userId: uid }),
        ChatReadState_1.default.deleteMany({ userId: uid }),
        CallSession_1.default.deleteMany({ callerId: uid }),
        WalletTopup_1.default.deleteMany({ userId: uid }),
        WalletCredit_1.default.deleteMany({ userId: uid }),
        CallerAppStoreReview_1.default.deleteMany({ userId: uid }),
        ReceiverRating_1.default.deleteMany({ raterId: uid }),
        ReceiverPriorityNotification_1.default.deleteMany({ userId: uid }),
        ReceiverAvailabilityNotification_1.default.deleteMany({ userId: uid }),
        UserReport_1.default.deleteMany({
            $or: [
                { reporterKind: 'user', reporterId: uid },
                { reportedKind: 'user', reportedId: uid },
            ],
        }),
        Referral_1.default.deleteMany({
            $or: [
                { referrerKind: 'user', referrerId: uid },
                { referredKind: 'user', referredId: uid },
            ],
        }),
        CallerOnlineNotification_1.default.updateMany({ callerIds: uid }, { $pull: { callerIds: uid } }),
    ]);
    await CallerOnlineNotification_1.default.deleteMany({ callerIds: { $size: 0 } });
    await User_1.default.deleteOne({ _id: uid });
}
