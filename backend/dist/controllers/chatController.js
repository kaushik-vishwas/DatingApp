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
exports.getMessages = getMessages;
exports.listConversations = listConversations;
exports.markConversationRead = markConversationRead;
exports.blockChatPeer = blockChatPeer;
exports.reportChatPeer = reportChatPeer;
exports.clearChatHistory = clearChatHistory;
const mongoose_1 = __importDefault(require("mongoose"));
const ChatMessage_1 = __importDefault(require("../models/ChatMessage"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const ChatReadState_1 = __importDefault(require("../models/ChatReadState"));
const UserReport_1 = __importStar(require("../models/UserReport"));
const accountAccess_1 = require("../utils/accountAccess");
const callerMessageEligibility_1 = require("../utils/callerMessageEligibility");
const HISTORY_LIMIT = 200;
function iso(d) {
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
async function getMessages(req, res) {
    try {
        const kind = req.accountKind;
        if (kind !== 'user' && kind !== 'receiver') {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        if (kind === 'user') {
            if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
                return;
            const receiverId = typeof req.query.receiverId === 'string' ? req.query.receiverId.trim() : '';
            if (!receiverId || !mongoose_1.default.Types.ObjectId.isValid(receiverId)) {
                res.status(400).json({ message: 'receiverId is required' });
                return;
            }
            const userId = String(req.user._id);
            if (await ChatBlock_1.default.exists({ userId, receiverId })) {
                res.status(403).json({ message: 'This conversation is blocked.' });
                return;
            }
            if (!(await (0, callerMessageEligibility_1.callerHasSuccessfulCallWithReceiver)(userId, receiverId))) {
                res.status(403).json({
                    message: 'Complete at least one successful call with this receiver before messaging.',
                    code: 'CALL_REQUIRED',
                });
                return;
            }
            const rows = await ChatMessage_1.default.find({ userId, receiverId })
                .sort({ createdAt: 1 })
                .limit(HISTORY_LIMIT)
                .lean();
            res.json({
                messages: rows.map((m) => ({
                    id: String(m._id),
                    senderType: m.senderType,
                    text: m.text,
                    createdAt: iso(m.createdAt),
                })),
            });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
        if (!userId || !mongoose_1.default.Types.ObjectId.isValid(userId)) {
            res.status(400).json({ message: 'userId is required' });
            return;
        }
        const receiverId = String(req.receiver._id);
        if (await ChatBlock_1.default.exists({ userId, receiverId })) {
            res.status(403).json({ message: 'This conversation is blocked.' });
            return;
        }
        const rows = await ChatMessage_1.default.find({ userId, receiverId })
            .sort({ createdAt: 1 })
            .limit(HISTORY_LIMIT)
            .lean();
        res.json({
            messages: rows.map((m) => ({
                id: String(m._id),
                senderType: m.senderType,
                text: m.text,
                createdAt: iso(m.createdAt),
            })),
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load messages' });
    }
}
async function listConversations(req, res) {
    try {
        const kind = req.accountKind;
        if (kind === 'user') {
            if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
                return;
            const uid = new mongoose_1.default.Types.ObjectId(String(req.user._id));
            const blockedReceiverIds = await ChatBlock_1.default.distinct('receiverId', { userId: uid });
            const convoMatch = { userId: uid };
            if (blockedReceiverIds.length > 0) {
                convoMatch.receiverId = { $nin: blockedReceiverIds };
            }
            const rows = await ChatMessage_1.default.aggregate([
                { $match: convoMatch },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: '$receiverId',
                        lastText: { $first: '$text' },
                        lastAt: { $first: '$createdAt' },
                    },
                },
                { $lookup: { from: 'receivers', localField: '_id', foreignField: '_id', as: 'r' } },
                { $unwind: '$r' },
                {
                    $project: {
                        _id: 0,
                        peerId: { $toString: '$_id' },
                        peerName: '$r.name',
                        peerImage: '$r.profileImage',
                        lastText: 1,
                        lastAt: 1,
                    },
                },
                { $sort: { lastAt: -1 } },
            ]);
            const userIdObj = new mongoose_1.default.Types.ObjectId(String(req.user._id));
            const peerReceiverIds = rows
                .map((r) => r.peerId)
                .filter((id) => mongoose_1.default.Types.ObjectId.isValid(id))
                .map((id) => new mongoose_1.default.Types.ObjectId(id));
            const readStates = await ChatReadState_1.default.find({
                userId: userIdObj,
                receiverId: { $in: peerReceiverIds },
            })
                .select('receiverId userLastReadAt')
                .lean();
            const readAtByReceiver = new Map(readStates.map((s) => [String(s.receiverId), s.userLastReadAt ?? null]));
            const unreadCounts = await Promise.all(rows.map(async (r) => {
                const receiverObj = new mongoose_1.default.Types.ObjectId(r.peerId);
                const lastRead = readAtByReceiver.get(r.peerId) ?? null;
                const filter = {
                    userId: userIdObj,
                    receiverId: receiverObj,
                    senderType: 'r',
                };
                if (lastRead)
                    filter.createdAt = { $gt: lastRead };
                return ChatMessage_1.default.countDocuments(filter);
            }));
            res.json({
                conversations: rows.map((r, i) => ({
                    peerId: r.peerId,
                    peerName: r.peerName,
                    peerImage: r.peerImage ?? null,
                    lastText: r.lastText,
                    lastAt: iso(r.lastAt),
                    unreadCount: unreadCounts[i] ?? 0,
                })),
            });
            return;
        }
        if (kind !== 'receiver') {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const rid = new mongoose_1.default.Types.ObjectId(String(req.receiver._id));
        const blockedUserIds = await ChatBlock_1.default.distinct('userId', { receiverId: rid });
        const recvConvoMatch = { receiverId: rid };
        if (blockedUserIds.length > 0) {
            recvConvoMatch.userId = { $nin: blockedUserIds };
        }
        const rows = await ChatMessage_1.default.aggregate([
            { $match: recvConvoMatch },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$userId',
                    lastText: { $first: '$text' },
                    lastAt: { $first: '$createdAt' },
                },
            },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
            { $unwind: '$u' },
            {
                $project: {
                    _id: 0,
                    peerId: { $toString: '$_id' },
                    peerName: '$u.name',
                    peerImage: '$u.profileImage',
                    lastText: 1,
                    lastAt: 1,
                },
            },
            { $sort: { lastAt: -1 } },
        ]);
        const receiverIdObj = new mongoose_1.default.Types.ObjectId(String(req.receiver._id));
        const peerUserIds = rows
            .map((r) => r.peerId)
            .filter((id) => mongoose_1.default.Types.ObjectId.isValid(id))
            .map((id) => new mongoose_1.default.Types.ObjectId(id));
        const readStates = await ChatReadState_1.default.find({
            receiverId: receiverIdObj,
            userId: { $in: peerUserIds },
        })
            .select('userId receiverLastReadAt')
            .lean();
        const readAtByUser = new Map(readStates.map((s) => [String(s.userId), s.receiverLastReadAt ?? null]));
        const unreadCounts = await Promise.all(rows.map(async (r) => {
            const userObj = new mongoose_1.default.Types.ObjectId(r.peerId);
            const lastRead = readAtByUser.get(r.peerId) ?? null;
            const filter = {
                userId: userObj,
                receiverId: receiverIdObj,
                senderType: 'u',
            };
            if (lastRead)
                filter.createdAt = { $gt: lastRead };
            return ChatMessage_1.default.countDocuments(filter);
        }));
        res.json({
            conversations: rows.map((r, i) => ({
                peerId: r.peerId,
                peerName: r.peerName,
                peerImage: r.peerImage ?? null,
                lastText: r.lastText,
                lastAt: iso(r.lastAt),
                unreadCount: unreadCounts[i] ?? 0,
            })),
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load conversations' });
    }
}
/**
 * POST /chat/mark-read — marks a conversation read for the current account.
 * Caller body: `{ receiverId }`; receiver body: `{ userId }`.
 */
async function markConversationRead(req, res) {
    try {
        const kind = req.accountKind;
        if (kind === 'user') {
            if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
                return;
            const receiverId = typeof req.body.receiverId === 'string' ? req.body.receiverId.trim() : '';
            if (!receiverId || !mongoose_1.default.Types.ObjectId.isValid(receiverId)) {
                res.status(400).json({ message: 'receiverId is required' });
                return;
            }
            await ChatReadState_1.default.findOneAndUpdate({ userId: req.user._id, receiverId: new mongoose_1.default.Types.ObjectId(receiverId) }, { $set: { userLastReadAt: new Date() } }, { upsert: true, new: true });
            res.status(200).json({ ok: true });
            return;
        }
        if (kind === 'receiver') {
            if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
                return;
            const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
            if (!userId || !mongoose_1.default.Types.ObjectId.isValid(userId)) {
                res.status(400).json({ message: 'userId is required' });
                return;
            }
            await ChatReadState_1.default.findOneAndUpdate({ userId: new mongoose_1.default.Types.ObjectId(userId), receiverId: req.receiver._id }, { $set: { receiverLastReadAt: new Date() } }, { upsert: true, new: true });
            res.status(200).json({ ok: true });
            return;
        }
        res.status(401).json({ message: 'Unauthorized' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to mark conversation as read' });
    }
}
function isReportReason(s) {
    return UserReport_1.REPORT_REASONS.includes(s);
}
/**
 * POST /chat/block — body: `{ receiverId }` (caller) or `{ userId }` (receiver).
 */
async function blockChatPeer(req, res) {
    try {
        const kind = req.accountKind;
        if (kind === 'user') {
            if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
                return;
            const receiverId = typeof req.body.receiverId === 'string' ? req.body.receiverId.trim() : '';
            if (!receiverId || !mongoose_1.default.Types.ObjectId.isValid(receiverId)) {
                res.status(400).json({ message: 'receiverId is required' });
                return;
            }
            await ChatBlock_1.default.findOneAndUpdate({ userId: req.user._id, receiverId }, { $setOnInsert: { userId: req.user._id, receiverId } }, { upsert: true, new: true });
            res.status(200).json({ ok: true });
            return;
        }
        if (kind === 'receiver') {
            if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
                return;
            const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
            if (!userId || !mongoose_1.default.Types.ObjectId.isValid(userId)) {
                res.status(400).json({ message: 'userId is required' });
                return;
            }
            await ChatBlock_1.default.findOneAndUpdate({ userId, receiverId: req.receiver._id }, { $setOnInsert: { userId, receiverId: req.receiver._id } }, { upsert: true, new: true });
            res.status(200).json({ ok: true });
            return;
        }
        res.status(401).json({ message: 'Unauthorized' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to block' });
    }
}
/**
 * POST /chat/report — body includes `reason` and optional `preview`; peer id key matches `/chat/block`.
 */
async function reportChatPeer(req, res) {
    try {
        const kind = req.accountKind;
        const reasonRaw = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
        const preview = typeof req.body.preview === 'string' ? req.body.preview.trim().slice(0, 500) : '';
        if (!isReportReason(reasonRaw)) {
            res.status(400).json({ message: 'Invalid reason' });
            return;
        }
        if (kind === 'user') {
            if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
                return;
            const receiverId = typeof req.body.receiverId === 'string' ? req.body.receiverId.trim() : '';
            if (!receiverId || !mongoose_1.default.Types.ObjectId.isValid(receiverId)) {
                res.status(400).json({ message: 'receiverId is required' });
                return;
            }
            await UserReport_1.default.create({
                reporterKind: 'user',
                reporterId: req.user._id,
                reportedKind: 'receiver',
                reportedId: new mongoose_1.default.Types.ObjectId(receiverId),
                reason: reasonRaw,
                preview,
                status: 'pending',
                resolution: null,
            });
            res.status(201).json({ ok: true });
            return;
        }
        if (kind === 'receiver') {
            if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
                return;
            const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
            if (!userId || !mongoose_1.default.Types.ObjectId.isValid(userId)) {
                res.status(400).json({ message: 'userId is required' });
                return;
            }
            await UserReport_1.default.create({
                reporterKind: 'receiver',
                reporterId: req.receiver._id,
                reportedKind: 'user',
                reportedId: new mongoose_1.default.Types.ObjectId(userId),
                reason: reasonRaw,
                preview,
                status: 'pending',
                resolution: null,
            });
            res.status(201).json({ ok: true });
            return;
        }
        res.status(401).json({ message: 'Unauthorized' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to submit report' });
    }
}
/**
 * POST /chat/clear — deletes message history for the pair (same body shape as `/chat/block`).
 */
async function clearChatHistory(req, res) {
    try {
        const kind = req.accountKind;
        if (kind === 'user') {
            if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
                return;
            const receiverId = typeof req.body.receiverId === 'string' ? req.body.receiverId.trim() : '';
            if (!receiverId || !mongoose_1.default.Types.ObjectId.isValid(receiverId)) {
                res.status(400).json({ message: 'receiverId is required' });
                return;
            }
            const r = await ChatMessage_1.default.deleteMany({ userId: req.user._id, receiverId });
            res.status(200).json({ ok: true, deletedCount: r.deletedCount ?? 0 });
            return;
        }
        if (kind === 'receiver') {
            if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
                return;
            const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
            if (!userId || !mongoose_1.default.Types.ObjectId.isValid(userId)) {
                res.status(400).json({ message: 'userId is required' });
                return;
            }
            const r = await ChatMessage_1.default.deleteMany({ userId, receiverId: req.receiver._id });
            res.status(200).json({ ok: true, deletedCount: r.deletedCount ?? 0 });
            return;
        }
        res.status(401).json({ message: 'Unauthorized' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to clear chat' });
    }
}
