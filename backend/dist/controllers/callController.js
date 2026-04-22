"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateVoiceSession = exports.endVoiceSession = exports.startVoiceSession = exports.getVoiceBootstrap = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const streamVoice_1 = require("../utils/streamVoice");
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
        Receiver_1.default.findById(receiverId).select('accountStatus suspended audioCallRate'),
    ]);
    if (!callerDoc || callerDoc.accountStatus !== 'approved' || callerDoc.suspended) {
        res.status(403).json({ message: 'Caller account is not allowed for calling' });
        return;
    }
    if (!receiverDoc || receiverDoc.accountStatus !== 'approved' || receiverDoc.suspended) {
        res.status(403).json({ message: 'Receiver account is not allowed for calling' });
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
        const session = await CallSession_1.default.findOne({ callId });
        if (!session) {
            res.status(404).json({ message: 'Call session not found' });
            return;
        }
        const isParticipant = String(session.callerId) === meId || String(session.receiverId) === meId;
        if (!isParticipant) {
            res.status(403).json({ message: 'Not allowed for this call' });
            return;
        }
        if (session.status !== 'completed') {
            const endedAt = new Date();
            const durationSec = Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000));
            session.endedAt = endedAt;
            session.durationSec = durationSec;
            session.status = 'completed';
            await session.save();
        }
        res.status(200).json({
            ok: true,
            durationSec: session.durationSec,
            estimatedEarning: Math.round(((session.durationSec / 60) * session.ratePerMinute) * 100) / 100,
        });
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
        session.callerRating = Math.round(rating);
        await session.save();
        res.status(200).json({ ok: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('rateVoiceSession error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.rateVoiceSession = rateVoiceSession;
