"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateVoiceSession = exports.endVoiceSession = exports.startVoiceSession = exports.getVoiceBootstrap = exports.getRandomQueuedReceiver = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const ReceiverRating_1 = __importDefault(require("../models/ReceiverRating"));
const streamVoice_1 = require("../utils/streamVoice");
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
    if (!accountKind || !meId) {
        res.status(401).json({ message: 'Not authorized' });
        return;
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(peerId)) {
        res.status(400).json({ message: 'Valid peerId is required' });
        return;
    }
    const callerUserId = accountKind === 'user' ? meId : peerId;
    const receiverId = accountKind === 'receiver' ? meId : peerId;
    const [callerDoc, receiverDoc] = await Promise.all([
        User_1.default.findById(callerUserId).select('accountStatus suspended'),
        Receiver_1.default.findById(receiverId).select('accountStatus suspended audioCallRate isAvailable isOnline'),
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
    const callId = (0, streamVoice_1.buildVoiceCallId)(meStreamUserId, peerStreamUserId);
    res.json({
        apiKey: (0, streamVoice_1.getStreamApiKey)(),
        token,
        tokenExpiresAt: expiresAt,
        streamUserId: meStreamUserId,
        peerStreamUserId,
        peerAccountId: peerId,
        receiverRatePerMinute: typeof receiverDoc.audioCallRate === 'number' && Number.isFinite(receiverDoc.audioCallRate)
            ? Math.max(0, receiverDoc.audioCallRate)
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
        const receiver = await Receiver_1.default.findById(receiverId).select('audioCallRate');
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        const ratePerMinute = typeof receiver.audioCallRate === 'number' && Number.isFinite(receiver.audioCallRate)
            ? Math.max(0, receiver.audioCallRate)
            : 0;
        await CallSession_1.default.findOneAndUpdate({ callId }, {
            $setOnInsert: {
                callId,
                callerId: new mongoose_1.default.Types.ObjectId(callerId),
                receiverId: new mongoose_1.default.Types.ObjectId(receiverId),
                startedAt: new Date(),
                status: 'ongoing',
                ratePerMinute,
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
        const dbSession = await mongoose_1.default.startSession();
        let finalDurationSec = current.durationSec;
        let settledAmountInr = roundInr(current.settledAmountInr || 0);
        try {
            await dbSession.withTransaction(async () => {
                const session = await CallSession_1.default.findOne({ callId }).session(dbSession);
                if (!session)
                    throw new Error('Call session not found');
                if (session.status === 'completed') {
                    finalDurationSec = session.durationSec;
                    settledAmountInr = roundInr(session.settledAmountInr || 0);
                    return;
                }
                const endedAt = new Date();
                const durationSec = Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000));
                const grossAmountInr = roundInr((durationSec / 60) * Math.max(0, session.ratePerMinute));
                const [callerDoc, receiverDoc] = await Promise.all([
                    User_1.default.findById(session.callerId).select('walletBalance').session(dbSession),
                    Receiver_1.default.findById(session.receiverId).select('walletBalance').session(dbSession),
                ]);
                if (!callerDoc || !receiverDoc) {
                    throw new Error('Call participant account not found');
                }
                const callerBalance = typeof callerDoc.walletBalance === 'number' && Number.isFinite(callerDoc.walletBalance)
                    ? Math.max(0, callerDoc.walletBalance)
                    : 0;
                const transferAmount = roundInr(Math.min(grossAmountInr, callerBalance));
                if (transferAmount > 0) {
                    callerDoc.walletBalance = roundInr(callerBalance - transferAmount);
                    receiverDoc.walletBalance = roundInr((typeof receiverDoc.walletBalance === 'number' && Number.isFinite(receiverDoc.walletBalance)
                        ? receiverDoc.walletBalance
                        : 0) + transferAmount);
                    await Promise.all([callerDoc.save({ session: dbSession }), receiverDoc.save({ session: dbSession })]);
                }
                session.endedAt = endedAt;
                session.durationSec = durationSec;
                session.status = 'completed';
                session.settledAmountInr = transferAmount;
                await session.save({ session: dbSession });
                finalDurationSec = durationSec;
                settledAmountInr = transferAmount;
            });
        }
        finally {
            await dbSession.endSession();
        }
        res.status(200).json({
            ok: true,
            durationSec: finalDurationSec,
            estimatedEarning: settledAmountInr,
            settledAmountInr,
            canRate: finalDurationSec >= 30,
        });
        (0, callQueue_2.releaseReceiverReservation)(String(current.receiverId));
        await (0, callQueue_2.syncReceiverQueueState)(String(current.receiverId));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('endVoiceSession error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.endVoiceSession = endVoiceSession;
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
