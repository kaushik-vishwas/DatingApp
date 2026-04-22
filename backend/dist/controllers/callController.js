"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVoiceBootstrap = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
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
        Receiver_1.default.findById(receiverId).select('accountStatus suspended'),
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
        callType: 'default',
        callId,
    });
};
exports.getVoiceBootstrap = getVoiceBootstrap;
