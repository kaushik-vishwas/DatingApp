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
exports.rateVoiceSession = exports.syncVoiceSession = exports.endVoiceSession = exports.startVoiceSession = exports.getVoiceBootstrap = exports.getRandomQueuedReceiver = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importStar(require("../models/Receiver"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const ReceiverRating_1 = __importDefault(require("../models/ReceiverRating"));
const streamVoice_1 = require("../utils/streamVoice");
const receiverScore_1 = require("../services/receiverScore");
const callQueue_1 = require("../services/callQueue");
const callQueue_2 = require("../services/callQueue");
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
async function settleCallSession(callId, complete) {
    const dbSession = await mongoose_1.default.startSession();
    let snapshot = null;
    try {
        await dbSession.withTransaction(async () => {
            const call = await CallSession_1.default.findOne({ callId }).session(dbSession);
            if (!call)
                throw new Error('Call session not found');
            if (call.status === 'completed') {
                snapshot = {
                    durationSec: call.durationSec,
                    settledAmountInr: roundInr(call.settledAmountInr || 0),
                    receiverEarnedInr: roundInr(call.receiverEarnedInr || 0),
                    status: 'completed',
                    receiverId: String(call.receiverId),
                    callerId: String(call.callerId),
                    startedAt: call.startedAt,
                    justCompleted: false,
                };
                return;
            }
            const now = new Date();
            const durationSec = Math.max(0, Math.round((now.getTime() - call.startedAt.getTime()) / 1000));
            const grossAmountInr = roundInr((durationSec / 60) * Math.max(0, call.ratePerMinute));
            const alreadySettled = roundInr(call.settledAmountInr || 0);
            const dueAmount = roundInr(Math.max(0, grossAmountInr - alreadySettled));
            const receiverEarnedInr = roundInr((durationSec / 60) * Math.max(0, Number(call.receiverPayoutRatePerMinute || 0)));
            let settledNow = 0;
            if (dueAmount > 0) {
                const [callerDoc, receiverDoc] = await Promise.all([
                    User_1.default.findById(call.callerId).select('walletBalance').session(dbSession),
                    Receiver_1.default.findById(call.receiverId).select('_id').session(dbSession),
                ]);
                if (!callerDoc || !receiverDoc) {
                    throw new Error('Call participant account not found');
                }
                const callerBalance = typeof callerDoc.walletBalance === 'number' && Number.isFinite(callerDoc.walletBalance)
                    ? Math.max(0, callerDoc.walletBalance)
                    : 0;
                settledNow = roundInr(Math.min(dueAmount, callerBalance));
                if (settledNow > 0) {
                    callerDoc.walletBalance = roundInr(callerBalance - settledNow);
                    await callerDoc.save({ session: dbSession });
                }
            }
            const nextSettled = roundInr(alreadySettled + settledNow);
            call.durationSec = durationSec;
            call.settledAmountInr = nextSettled;
            call.receiverEarnedInr = receiverEarnedInr;
            if (complete) {
                call.status = 'completed';
                call.endedAt = now;
            }
            await call.save({ session: dbSession });
            snapshot = {
                durationSec,
                settledAmountInr: nextSettled,
                receiverEarnedInr,
                status: complete ? 'completed' : 'ongoing',
                receiverId: String(call.receiverId),
                callerId: String(call.callerId),
                startedAt: call.startedAt,
                justCompleted: complete,
            };
        });
    }
    finally {
        await dbSession.endSession();
    }
    if (!snapshot) {
        throw new Error('Call settlement failed');
    }
    return snapshot;
}
const getRandomQueuedReceiver = async (req, res) => {
    try {
        if (req.accountKind !== 'user' || !req.user?._id) {
            res.status(403).json({ message: 'Only callers can use random call match' });
            return;
        }
        const callerId = String(req.user._id);
        const caller = await User_1.default.findById(callerId).select('accountStatus suspended');
        if (!caller || caller.accountStatus !== 'approved' || caller.suspended) {
            res.status(403).json({ message: 'Caller account is not allowed for calling' });
            return;
        }
        const timeoutMs = 10_000;
        const pollEveryMs = 1_000;
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const matched = await (0, callQueue_1.pickRandomQueuedReceiverForCaller)(callerId);
            if (matched) {
                res.status(200).json(matched);
                return;
            }
            await sleep(pollEveryMs);
        }
        res.status(404).json({ message: 'No available receiver found right now. Please try again shortly.' });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getRandomQueuedReceiver error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getRandomQueuedReceiver = getRandomQueuedReceiver;
const getVoiceBootstrap = async (req, res) => {
    const accountKind = req.accountKind;
    const meId = accountKind === 'user' ? String(req.user?._id ?? '') : String(req.receiver?._id ?? '');
    const peerId = typeof req.query.peerId === 'string' ? req.query.peerId.trim() : '';
    const requestedCallId = typeof req.query.callId === 'string' ? req.query.callId.trim() : '';
    if (!accountKind || !meId) {
        res.status(401).json({ message: 'Not authorized' });
        return;
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(peerId)) {
        res.status(400).json({ message: 'Valid peerId is required' });
        return;
    }
    if (requestedCallId && requestedCallId.length > 200) {
        res.status(400).json({ message: 'Invalid callId' });
        return;
    }
    const callerUserId = accountKind === 'user' ? meId : peerId;
    const receiverId = accountKind === 'receiver' ? meId : peerId;
    const [callerDoc, receiverDoc] = await Promise.all([
        User_1.default.findById(callerUserId).select('accountStatus suspended'),
        Receiver_1.default.findById(receiverId).select('accountStatus suspended audioCallRate isAvailable isOnline earningRatePerMinute'),
    ]);
    if (!callerDoc || callerDoc.accountStatus !== 'approved' || callerDoc.suspended) {
        res.status(403).json({ message: 'Caller account is not allowed for calling' });
        return;
    }
    if (!receiverDoc || receiverDoc.accountStatus !== 'approved' || receiverDoc.suspended) {
        res.status(403).json({ message: 'Receiver account is not allowed for calling' });
        return;
    }
    const ongoing = await CallSession_1.default.exists({
        receiverId: new mongoose_1.default.Types.ObjectId(receiverId),
        status: 'ongoing',
    });
    // Receiver gets reserved as soon as invite is created; that reservation must not block
    // the receiver-side bootstrap after accepting the same invite.
    if (ongoing || (accountKind === 'user' && (0, callQueue_2.isReceiverBusy)(receiverId))) {
        res.status(409).json({ message: 'Receiver is busy on another call' });
        return;
    }
    if (!receiverDoc.isAvailable) {
        res.status(409).json({ message: 'Receiver is currently unavailable' });
        return;
    }
    if (await ChatBlock_1.default.exists({ userId: callerUserId, receiverId })) {
        res.status(403).json({ message: 'This pair is blocked for communication' });
        return;
    }
    const meStreamUserId = (0, streamVoice_1.toStreamUserId)(accountKind, meId);
    const peerStreamUserId = (0, streamVoice_1.toStreamUserId)(accountKind === 'user' ? 'receiver' : 'user', peerId);
    const { token, expiresAt } = (0, streamVoice_1.createStreamUserToken)(meStreamUserId);
    const callId = requestedCallId || (0, streamVoice_1.buildVoiceCallId)(meStreamUserId, peerStreamUserId);
    res.json({
        apiKey: (0, streamVoice_1.getStreamApiKey)(),
        token,
        tokenExpiresAt: expiresAt,
        streamUserId: meStreamUserId,
        peerStreamUserId,
        peerAccountId: peerId,
        receiverRatePerMinute: Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
        receiverEarningRatePerMinute: typeof receiverDoc.earningRatePerMinute === 'number' && Number.isFinite(receiverDoc.earningRatePerMinute)
            ? roundInr(receiverDoc.earningRatePerMinute)
            : 0,
        callType: 'default',
        callId,
    });
};
exports.getVoiceBootstrap = getVoiceBootstrap;
const startVoiceSession = async (req, res) => {
    try {
        const accountKind = req.accountKind;
        const meId = accountKind === 'user' ? String(req.user?._id ?? '') : String(req.receiver?._id ?? '');
        const callId = String(req.body.callId ?? '').trim();
        const peerId = String(req.body.peerId ?? '').trim();
        if (!accountKind || !meId) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        if (!callId) {
            res.status(400).json({ message: 'callId is required' });
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(peerId)) {
            res.status(400).json({ message: 'Valid peerId is required' });
            return;
        }
        const callerId = accountKind === 'user' ? meId : peerId;
        const receiverId = accountKind === 'receiver' ? meId : peerId;
        const receiver = await Receiver_1.default.findById(receiverId).select('audioCallRate earningRatePerMinute');
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        const ratePerMinute = Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN;
        const receiverPayoutRatePerMinute = typeof receiver.earningRatePerMinute === 'number' && Number.isFinite(receiver.earningRatePerMinute)
            ? Math.max(0, receiver.earningRatePerMinute)
            : 0;
        await CallSession_1.default.findOneAndUpdate({ callId }, {
            $setOnInsert: {
                callId,
                callerId: new mongoose_1.default.Types.ObjectId(callerId),
                receiverId: new mongoose_1.default.Types.ObjectId(receiverId),
                startedAt: new Date(),
                status: 'ongoing',
                ratePerMinute,
                receiverPayoutRatePerMinute,
            },
        }, { upsert: true, new: true, setDefaultsOnInsert: true });
        res.status(200).json({ ok: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('startVoiceSession error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.startVoiceSession = startVoiceSession;
const endVoiceSession = async (req, res) => {
    try {
        const accountKind = req.accountKind;
        const meId = accountKind === 'user' ? String(req.user?._id ?? '') : String(req.receiver?._id ?? '');
        const callId = String(req.body.callId ?? '').trim();
        if (!accountKind || !meId) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        if (!callId) {
            res.status(400).json({ message: 'callId is required' });
            return;
        }
        const current = await CallSession_1.default.findOne({ callId });
        if (!current) {
            res.status(404).json({ message: 'Call session not found' });
            return;
        }
        const isParticipant = String(current.callerId) === meId || String(current.receiverId) === meId;
        if (!isParticipant) {
            res.status(403).json({ message: 'Not allowed for this call' });
            return;
        }
        const settled = await settleCallSession(callId, true);
        if (settled.justCompleted) {
            void (0, receiverScore_1.recordReceiverCallScore)({
                callId,
                receiverId: settled.receiverId,
                callerId: settled.callerId,
                startedAt: settled.startedAt,
                durationSec: settled.durationSec,
            }).catch((e) => {
                const msg = e instanceof Error ? e.message : String(e);
                console.error('receiver call score record error:', msg);
            });
        }
        res.status(200).json({
            ok: true,
            durationSec: settled.durationSec,
            estimatedEarning: settled.receiverEarnedInr,
            settledAmountInr: settled.settledAmountInr,
            receiverEarnedInr: settled.receiverEarnedInr,
            canRate: settled.durationSec >= 30,
        });
        (0, callQueue_2.releaseReceiverReservation)(settled.receiverId);
        await (0, callQueue_2.syncReceiverQueueState)(settled.receiverId);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('endVoiceSession error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.endVoiceSession = endVoiceSession;
const syncVoiceSession = async (req, res) => {
    try {
        const accountKind = req.accountKind;
        const meId = accountKind === 'user' ? String(req.user?._id ?? '') : String(req.receiver?._id ?? '');
        const callId = String(req.body.callId ?? '').trim();
        if (!accountKind || !meId) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        if (!callId) {
            res.status(400).json({ message: 'callId is required' });
            return;
        }
        const current = await CallSession_1.default.findOne({ callId });
        if (!current) {
            res.status(404).json({ message: 'Call session not found' });
            return;
        }
        const isParticipant = String(current.callerId) === meId || String(current.receiverId) === meId;
        if (!isParticipant) {
            res.status(403).json({ message: 'Not allowed for this call' });
            return;
        }
        const settled = await settleCallSession(callId, false);
        res.status(200).json({
            ok: true,
            durationSec: settled.durationSec,
            settledAmountInr: settled.settledAmountInr,
            receiverEarnedInr: settled.receiverEarnedInr,
            canRate: settled.durationSec >= 30,
            status: settled.status,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('syncVoiceSession error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.syncVoiceSession = syncVoiceSession;
const rateVoiceSession = async (req, res) => {
    try {
        if (req.accountKind !== 'user' || !req.user?._id) {
            res.status(403).json({ message: 'Only callers can submit rating' });
            return;
        }
        const callId = String(req.body.callId ?? '').trim();
        const rating = Number(req.body.rating);
        if (!callId) {
            res.status(400).json({ message: 'callId is required' });
            return;
        }
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
            res.status(400).json({ message: 'rating must be between 1 and 5' });
            return;
        }
        const session = await CallSession_1.default.findOne({ callId, callerId: req.user._id });
        if (!session) {
            res.status(404).json({ message: 'Call session not found' });
            return;
        }
        if (session.status !== 'completed') {
            res.status(409).json({ message: 'You can rate only after a completed call.' });
            return;
        }
        if (session.durationSec < 30) {
            res.status(409).json({ message: 'Call too short for rating. Minimum 30 seconds required.' });
            return;
        }
        if (typeof session.callerRating === 'number') {
            res.status(409).json({ message: 'This call has already been rated.' });
            return;
        }
        const rounded = Math.round(rating);
        session.callerRating = rounded;
        await session.save();
        await ReceiverRating_1.default.findOneAndUpdate({
            receiverId: session.receiverId,
            raterId: session.callerId,
        }, {
            $set: {
                rating: rounded,
                lastCallId: session.callId,
            },
        }, { upsert: true, new: true });
        res.status(200).json({ ok: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('rateVoiceSession error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.rateVoiceSession = rateVoiceSession;
