"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomKey = roomKey;
exports.attachChatSocket = attachChatSocket;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const ChatMessage_1 = __importDefault(require("../models/ChatMessage"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const authToken_1 = require("../utils/authToken");
const socketRegistry_1 = require("./socketRegistry");
const chatPricing_1 = require("../constants/chatPricing");
const receiverScore_1 = require("../services/receiverScore");
const receiverAvailabilityNotifier_1 = require("../services/receiverAvailabilityNotifier");
const callInviteRegistry_1 = require("../services/callInviteRegistry");
const callController_1 = require("../controllers/callController");
const callQueue_1 = require("../services/callQueue");
function roomKey(userId, receiverId) {
    return `chat:${userId}:${receiverId}`;
}
function parseRoom(room) {
    const prefix = 'chat:';
    if (!room.startsWith(prefix))
        return null;
    const rest = room.slice(prefix.length);
    const colon = rest.indexOf(':');
    if (colon <= 0)
        return null;
    const userId = rest.slice(0, colon);
    const receiverId = rest.slice(colon + 1);
    if (!mongoose_1.default.Types.ObjectId.isValid(userId) || !mongoose_1.default.Types.ObjectId.isValid(receiverId))
        return null;
    return { userId, receiverId };
}
function accountRoom(typ, accountId) {
    return `account:${typ}:${accountId}`;
}
/**
 * Real-time 1:1 chat between an app user (`users`) and a receiver (`receivers`).
 * Client authenticates with the same JWT as REST (`handshake.auth.token`).
 */
function attachChatSocket(httpServer) {
    const activeCallInvites = new Map();
    const waitingCallQueueAccounts = new Set();
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
    });
    const DISCONNECT_GRACE_MS = 5000;
    const queueKey = (typ, accountId) => `${typ}:${String(accountId).trim()}`;
    const hasActiveSocketForAccount = (typ, accountId) => (io.sockets.adapter.rooms.get(accountRoom(typ, accountId))?.size ?? 0) > 0;
    const settleAndReleaseCall = async (callId, receiverId) => {
        try {
            const settled = await (0, callController_1.settleCallSession)(callId, true);
            if (settled.justCompleted) {
                void (0, receiverScore_1.recordReceiverCallScore)({
                    callId,
                    receiverId: settled.receiverId,
                    callerId: settled.callerId,
                    startedAt: settled.startedAt,
                    durationSec: settled.durationSec,
                }).catch((e) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    console.error('receiver call score record error (socket):', msg);
                });
            }
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('socket settleAndReleaseCall error:', msg);
        }
        finally {
            (0, callInviteRegistry_1.unregisterPendingCallInvite)(receiverId);
            (0, callQueue_1.releaseReceiverReservation)(receiverId);
            await (0, callQueue_1.syncReceiverQueueState)(receiverId);
        }
    };
    const cancelPendingInvitesFor = (typ, accountId) => {
        for (const [callId, invite] of activeCallInvites) {
            const isTarget = invite.targetType === typ && invite.targetId === accountId;
            const isInviter = invite.inviterType === typ && invite.inviterId === accountId;
            if (!isTarget && !isInviter)
                continue;
            if (invite.timeoutHandle) {
                clearTimeout(invite.timeoutHandle);
                invite.timeoutHandle = null;
            }
            activeCallInvites.delete(callId);
            void settleAndReleaseCall(callId, invite.receiverId);
            io.to(accountRoom(invite.inviterType, invite.inviterId)).emit('call:ended', {
                callId,
                fromType: typ,
                fromId: accountId,
            });
            io.to(accountRoom(invite.targetType, invite.targetId)).emit('call:ended', {
                callId,
                fromType: typ,
                fromId: accountId,
            });
        }
    };
    io.use((socket, next) => {
        void (async () => {
            try {
                const raw = socket.handshake.auth?.token;
                const token = typeof raw === 'string' ? raw.trim() : '';
                if (!token) {
                    next(new Error('auth required'));
                    return;
                }
                const secret = process.env.JWT_SECRET;
                if (!secret) {
                    next(new Error('server misconfigured'));
                    return;
                }
                const decoded = jsonwebtoken_1.default.verify(token, secret);
                if (decoded.typ !== 'u' && decoded.typ !== 'r') {
                    next(new Error('invalid token'));
                    return;
                }
                const tokenSv = (0, authToken_1.getPayloadSessionVersion)(decoded);
                if (decoded.typ === 'u') {
                    const user = await User_1.default.findById(decoded.id).select('authSessionVersion');
                    if (!user) {
                        next(new Error('auth failed'));
                        return;
                    }
                    const dbSv = typeof user.authSessionVersion === 'number' ? user.authSessionVersion : 0;
                    if (tokenSv !== dbSv) {
                        next(new Error('session superseded'));
                        return;
                    }
                }
                else {
                    const receiver = await Receiver_1.default.findById(decoded.id).select('authSessionVersion');
                    if (!receiver) {
                        next(new Error('auth failed'));
                        return;
                    }
                    const dbSv = typeof receiver.authSessionVersion === 'number' ? receiver.authSessionVersion : 0;
                    if (tokenSv !== dbSv) {
                        next(new Error('session superseded'));
                        return;
                    }
                }
                socket.data.typ = decoded.typ;
                socket.data.accountId = decoded.id;
                next();
            }
            catch {
                next(new Error('auth failed'));
            }
        })();
    });
    io.on('connection', (socket) => {
        const socketType = socket.data.typ;
        const socketAccountId = String(socket.data.accountId);
        const selfRoom = accountRoom(socketType, socketAccountId);
        void socket.join(selfRoom);
        if (socketType === 'r') {
            void (async () => {
                try {
                    const prev = await Receiver_1.default.findOneAndUpdate({ _id: socketAccountId }, { $set: { isOnline: true }, $setOnInsert: {} }, { new: false }).select('isOnline isAvailable accountStatus suspended onlineSince');
                    if (prev && !prev.isOnline) {
                        await Receiver_1.default.updateOne({ _id: socketAccountId, onlineSince: null }, { $set: { onlineSince: new Date() } }).exec();
                    }
                    if (prev &&
                        !prev.isOnline &&
                        prev.isAvailable &&
                        prev.accountStatus === 'approved' &&
                        !prev.suspended) {
                        await (0, receiverAvailabilityNotifier_1.scheduleReceiverAvailabilityNotifications)(socketAccountId);
                    }
                    await (0, callQueue_1.syncReceiverQueueState)(socketAccountId);
                }
                catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    console.error('receiver online notify error:', msg);
                }
            })();
        }
        socket.on('disconnect', () => {
            const leavingId = String(socket.data.accountId);
            const leavingType = socket.data.typ;
            setTimeout(() => {
                if (hasActiveSocketForAccount(leavingType, leavingId))
                    return;
                waitingCallQueueAccounts.delete(queueKey(leavingType, leavingId));
                if (leavingType === 'r') {
                    (0, callQueue_1.setReceiverQueuePresence)(leavingId, false);
                }
                cancelPendingInvitesFor(leavingType, leavingId);
                for (const [callId, invite] of activeCallInvites) {
                    if ((invite.inviterId === leavingId && invite.inviterType === leavingType) ||
                        (invite.targetId === leavingId && invite.targetType === leavingType)) {
                        if (invite.timeoutHandle) {
                            clearTimeout(invite.timeoutHandle);
                            invite.timeoutHandle = null;
                        }
                        activeCallInvites.delete(callId);
                        (0, callInviteRegistry_1.unregisterPendingCallInvite)(invite.receiverId);
                        (0, callQueue_1.releaseReceiverReservation)(invite.receiverId);
                        void (0, callQueue_1.syncReceiverQueueState)(invite.receiverId);
                    }
                }
            }, DISCONNECT_GRACE_MS);
            if (leavingType === 'r') {
                // Keep online=true while any receiver socket remains connected for this account.
                setTimeout(() => {
                    const stillConnected = hasActiveSocketForAccount('r', leavingId);
                    if (!stillConnected) {
                        void (async () => {
                            const prev = await Receiver_1.default.findOneAndUpdate({ _id: leavingId }, { $set: { isOnline: false, onlineSince: null } }, { new: false }).select('onlineSince');
                            if (prev?.onlineSince) {
                                await (0, receiverScore_1.finalizeReceiverOnlineSession)({
                                    receiverId: leavingId,
                                    onlineSince: prev.onlineSince,
                                    endedAt: new Date(),
                                });
                            }
                            (0, callQueue_1.releaseReceiverReservation)(leavingId);
                            await (0, callQueue_1.syncReceiverQueueState)(leavingId);
                        })();
                    }
                }, 300);
            }
        });
        socket.on('chat:join', (payload, ack) => {
            void (async () => {
                try {
                    const typ = socket.data.typ;
                    const myId = String(socket.data.accountId);
                    let userHex;
                    let receiverHex;
                    if (typ === 'u') {
                        const rid = typeof payload?.receiverId === 'string' ? payload.receiverId.trim() : '';
                        if (!mongoose_1.default.Types.ObjectId.isValid(rid)) {
                            ack?.({ ok: false, error: 'Invalid receiverId' });
                            return;
                        }
                        userHex = myId;
                        receiverHex = rid;
                        const u = await User_1.default.findById(myId).select('accountStatus suspended');
                        if (!u || u.suspended || u.accountStatus !== 'approved') {
                            ack?.({ ok: false, error: 'Account not allowed' });
                            return;
                        }
                        const recv = await Receiver_1.default.findById(rid).select('accountStatus suspended');
                        if (!recv || recv.accountStatus !== 'approved' || recv.suspended) {
                            ack?.({ ok: false, error: 'Cannot join this chat' });
                            return;
                        }
                    }
                    else {
                        const uid = typeof payload?.userId === 'string' ? payload.userId.trim() : '';
                        if (!mongoose_1.default.Types.ObjectId.isValid(uid)) {
                            ack?.({ ok: false, error: 'Invalid userId' });
                            return;
                        }
                        userHex = uid;
                        receiverHex = myId;
                        const recv = await Receiver_1.default.findById(myId).select('accountStatus suspended');
                        if (!recv || recv.accountStatus !== 'approved' || recv.suspended) {
                            ack?.({ ok: false, error: 'Account not allowed' });
                            return;
                        }
                        const u = await User_1.default.findById(uid).select('accountStatus suspended');
                        if (!u || u.suspended || u.accountStatus !== 'approved') {
                            ack?.({ ok: false, error: 'Cannot join this chat' });
                            return;
                        }
                    }
                    const prevRoom = socket.data.chatRoom;
                    if (prevRoom) {
                        await socket.leave(prevRoom);
                    }
                    if (await ChatBlock_1.default.exists({ userId: userHex, receiverId: receiverHex })) {
                        ack?.({ ok: false, error: 'This chat is blocked.' });
                        return;
                    }
                    const room = roomKey(userHex, receiverHex);
                    await socket.join(room);
                    socket.data.chatRoom = room;
                    ack?.({ ok: true });
                }
                catch (err) {
                    ack?.({ ok: false, error: err instanceof Error ? err.message : 'join failed' });
                }
            })();
        });
        socket.on('chat:leave', (_payload, ack) => {
            void (async () => {
                const room = socket.data.chatRoom;
                if (room) {
                    await socket.leave(room);
                }
                socket.data.chatRoom = undefined;
                ack?.({ ok: true });
            })();
        });
        socket.on('chat:message', (payload, ack) => {
            void (async () => {
                try {
                    const room = socket.data.chatRoom;
                    if (!room) {
                        ack?.({ ok: false, error: 'Join a chat first' });
                        return;
                    }
                    const parsed = parseRoom(room);
                    if (!parsed) {
                        ack?.({ ok: false, error: 'Bad room' });
                        return;
                    }
                    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
                    if (!text) {
                        ack?.({ ok: false, error: 'Empty message' });
                        return;
                    }
                    if (text.length > 2000) {
                        ack?.({ ok: false, error: 'Message too long' });
                        return;
                    }
                    const typ = socket.data.typ;
                    const myId = String(socket.data.accountId);
                    if (typ === 'u' && myId !== parsed.userId) {
                        ack?.({ ok: false, error: 'Forbidden' });
                        return;
                    }
                    if (typ === 'r' && myId !== parsed.receiverId) {
                        ack?.({ ok: false, error: 'Forbidden' });
                        return;
                    }
                    if (typ === 'u') {
                        const u = await User_1.default.findById(myId).select('accountStatus suspended');
                        if (!u || u.suspended || u.accountStatus !== 'approved') {
                            ack?.({ ok: false, error: 'Account not allowed' });
                            return;
                        }
                    }
                    else {
                        const recv = await Receiver_1.default.findById(myId).select('accountStatus suspended');
                        if (!recv || recv.accountStatus !== 'approved' || recv.suspended) {
                            ack?.({ ok: false, error: 'Account not allowed' });
                            return;
                        }
                    }
                    if (await ChatBlock_1.default.exists({ userId: parsed.userId, receiverId: parsed.receiverId })) {
                        ack?.({ ok: false, error: 'This chat is blocked.' });
                        return;
                    }
                    let doc;
                    const uidObj = new mongoose_1.default.Types.ObjectId(parsed.userId);
                    const ridObj = new mongoose_1.default.Types.ObjectId(parsed.receiverId);
                    if (typ === 'u') {
                        const hasReceiverReply = await ChatMessage_1.default.exists({
                            userId: uidObj,
                            receiverId: ridObj,
                            senderType: 'r',
                        });
                        const needCharge = Boolean(hasReceiverReply);
                        if (needCharge) {
                            const session = await mongoose_1.default.startSession();
                            try {
                                await session.withTransaction(async () => {
                                    const usrUpd = await User_1.default.updateOne({ _id: uidObj, walletBalance: { $gte: chatPricing_1.CHAT_TEXT_FEE_INR } }, { $inc: { walletBalance: -chatPricing_1.CHAT_TEXT_FEE_INR } }, { session });
                                    if (usrUpd.modifiedCount === 0) {
                                        throw new Error('INSUFFICIENT_WALLET');
                                    }
                                    const recvUpd = await Receiver_1.default.updateOne({ _id: ridObj }, { $inc: { walletBalance: chatPricing_1.CHAT_TEXT_FEE_INR } }, { session });
                                    if (recvUpd.modifiedCount !== 1) {
                                        throw new Error('RECEIVER_CREDIT_FAILED');
                                    }
                                    const created = await ChatMessage_1.default.create([
                                        {
                                            userId: uidObj,
                                            receiverId: ridObj,
                                            senderType: typ,
                                            text,
                                            feeInr: chatPricing_1.CHAT_TEXT_FEE_INR,
                                        },
                                    ], { session });
                                    doc = created[0];
                                });
                            }
                            catch (e) {
                                if (e instanceof Error && e.message === 'INSUFFICIENT_WALLET') {
                                    const uDoc = await User_1.default.findById(uidObj).select('walletBalance');
                                    ack?.({
                                        ok: false,
                                        code: 'INSUFFICIENT_WALLET',
                                        error: 'Wallet balance is too low to send this message.',
                                        walletBalance: typeof uDoc?.walletBalance === 'number' && Number.isFinite(uDoc.walletBalance)
                                            ? uDoc.walletBalance
                                            : 0,
                                        requiredInr: chatPricing_1.CHAT_TEXT_FEE_INR,
                                    });
                                    return;
                                }
                                if (e instanceof Error && e.message === 'RECEIVER_CREDIT_FAILED') {
                                    console.error('Receiver wallet credit failed', { userId: parsed.userId, receiverId: parsed.receiverId });
                                    ack?.({ ok: false, error: 'Could not update receiver wallet. Try again.' });
                                    return;
                                }
                                throw e;
                            }
                            finally {
                                await session.endSession();
                            }
                            const [freshCaller, freshRecv] = await Promise.all([
                                User_1.default.findById(uidObj).select('walletBalance'),
                                Receiver_1.default.findById(ridObj).select('walletBalance'),
                            ]);
                            io.to(room).emit('chat:wallet', {
                                callerWallet: typeof freshCaller?.walletBalance === 'number' &&
                                    Number.isFinite(freshCaller.walletBalance)
                                    ? freshCaller.walletBalance
                                    : 0,
                                receiverWallet: typeof freshRecv?.walletBalance === 'number' && Number.isFinite(freshRecv.walletBalance)
                                    ? freshRecv.walletBalance
                                    : 0,
                            });
                        }
                        else {
                            doc = await ChatMessage_1.default.create({
                                userId: uidObj,
                                receiverId: ridObj,
                                senderType: typ,
                                text,
                                feeInr: 0,
                            });
                        }
                    }
                    else {
                        doc = await ChatMessage_1.default.create({
                            userId: uidObj,
                            receiverId: ridObj,
                            senderType: typ,
                            text,
                            feeInr: 0,
                        });
                    }
                    const out = {
                        id: String(doc._id),
                        senderType: typ,
                        text: doc.text,
                        createdAt: doc.createdAt.toISOString(),
                    };
                    io.to(room).emit('chat:newMessage', out);
                    io.to(accountRoom('u', parsed.userId)).emit('chat:inbox', {
                        peerId: parsed.receiverId,
                        lastText: doc.text,
                        lastAt: doc.createdAt.toISOString(),
                        fromType: typ,
                    });
                    io.to(accountRoom('r', parsed.receiverId)).emit('chat:inbox', {
                        peerId: parsed.userId,
                        lastText: doc.text,
                        lastAt: doc.createdAt.toISOString(),
                        fromType: typ,
                    });
                    ack?.({ ok: true, message: out });
                }
                catch (err) {
                    console.error(err);
                    ack?.({ ok: false, error: 'Failed to send' });
                }
            })();
        });
        socket.on('chat:typing', (payload, ack) => {
            const room = socket.data.chatRoom;
            if (!room) {
                ack?.({ ok: false, error: 'Join a chat first' });
                return;
            }
            const parsed = parseRoom(room);
            if (!parsed) {
                ack?.({ ok: false, error: 'Bad room' });
                return;
            }
            const typ = socket.data.typ;
            const typing = Boolean(payload?.typing);
            const fromId = String(socket.data.accountId);
            io.to(room).emit('chat:typing', {
                peerId: typ === 'u' ? parsed.userId : parsed.receiverId,
                fromType: typ,
                fromId,
                typing,
            });
            if (typ === 'u') {
                io.to(accountRoom('r', parsed.receiverId)).emit('chat:typing', {
                    peerId: parsed.userId,
                    fromType: typ,
                    fromId,
                    typing,
                });
            }
            else {
                io.to(accountRoom('u', parsed.userId)).emit('chat:typing', {
                    peerId: parsed.receiverId,
                    fromType: typ,
                    fromId,
                    typing,
                });
            }
            ack?.({ ok: true });
        });
        socket.on('call:queue:set', (payload, ack) => {
            const typ = socket.data.typ;
            const accountId = String(socket.data.accountId);
            const active = Boolean(payload?.active);
            const key = queueKey(typ, accountId);
            if (active) {
                waitingCallQueueAccounts.add(key);
                if (typ === 'r') {
                    (0, callQueue_1.setReceiverQueuePresence)(accountId, true);
                }
            }
            else {
                waitingCallQueueAccounts.delete(key);
                if (typ === 'r') {
                    (0, callQueue_1.setReceiverQueuePresence)(accountId, false);
                }
                cancelPendingInvitesFor(typ, accountId);
            }
            ack?.({ ok: true, active });
        });
        socket.on('call:invite', (payload, ack) => {
            void (async () => {
                const typ = socket.data.typ;
                const myId = String(socket.data.accountId);
                const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
                const targetId = typeof payload?.targetId === 'string' ? payload.targetId.trim() : '';
                if (!callId) {
                    ack?.({ ok: false, error: 'callId is required' });
                    return;
                }
                if (!mongoose_1.default.Types.ObjectId.isValid(targetId)) {
                    ack?.({ ok: false, error: 'targetId is required' });
                    return;
                }
                const targetType = typ === 'u' ? 'r' : 'u';
                let userId;
                let receiverId;
                if (typ === 'u') {
                    userId = myId;
                    receiverId = targetId;
                }
                else {
                    userId = targetId;
                    receiverId = myId;
                }
                if (await ChatBlock_1.default.exists({ userId, receiverId })) {
                    ack?.({ ok: false, error: 'This chat is blocked.' });
                    return;
                }
                let receiverForInviteId = '';
                if (typ === 'u') {
                    const recv = await Receiver_1.default.findById(targetId).select('accountStatus suspended isAvailable isOnline');
                    if (!recv ||
                        recv.accountStatus !== 'approved' ||
                        recv.suspended ||
                        !recv.isAvailable) {
                        ack?.({ ok: false, error: 'Cannot call this receiver right now.' });
                        return;
                    }
                    const targetOnline = (io.sockets.adapter.rooms.get(accountRoom('r', targetId))?.size ?? 0) > 0;
                    if (!targetOnline) {
                        ack?.({ ok: false, error: 'Receiver is offline right now.' });
                        return;
                    }
                    receiverForInviteId = targetId;
                    await (0, callQueue_1.releaseIfStaleReceiverBusy)(receiverForInviteId);
                    const notifyReceiverBusyMissedCall = async () => {
                        const inviter = await User_1.default.findById(myId).select('name profileImage').lean();
                        io.to(accountRoom('r', targetId)).emit('call:missed', {
                            callerId: myId,
                            callerName: inviter?.name?.trim() || 'Caller',
                            callerImage: inviter?.profileImage ?? null,
                            at: new Date().toISOString(),
                        });
                    };
                    if ((0, callQueue_1.isReceiverBusy)(receiverForInviteId)) {
                        await notifyReceiverBusyMissedCall();
                        ack?.({ ok: false, error: 'Busy on another call.' });
                        return;
                    }
                }
                else {
                    const recv = await Receiver_1.default.findById(myId).select('accountStatus suspended isAvailable isOnline');
                    if (!recv ||
                        recv.accountStatus !== 'approved' ||
                        recv.suspended ||
                        !recv.isAvailable ||
                        !recv.isOnline) {
                        ack?.({ ok: false, error: 'You are not available for calls right now.' });
                        return;
                    }
                    receiverForInviteId = myId;
                    await (0, callQueue_1.releaseIfStaleReceiverBusy)(receiverForInviteId);
                    if ((0, callQueue_1.isReceiverBusy)(receiverForInviteId)) {
                        ack?.({ ok: false, error: 'Busy on another call.' });
                        return;
                    }
                    const usr = await User_1.default.findById(targetId).select('accountStatus suspended');
                    if (!usr || usr.suspended || usr.accountStatus !== 'approved') {
                        ack?.({ ok: false, error: 'Cannot call this user right now.' });
                        return;
                    }
                    const targetOnline = (io.sockets.adapter.rooms.get(accountRoom('u', targetId))?.size ?? 0) > 0;
                    if (!targetOnline) {
                        ack?.({ ok: false, error: 'User is offline right now.' });
                        return;
                    }
                }
                if (!(0, callQueue_1.tryReserveReceiver)(receiverForInviteId)) {
                    if (typ === 'u') {
                        const inviter = await User_1.default.findById(myId).select('name profileImage').lean();
                        io.to(accountRoom('r', targetId)).emit('call:missed', {
                            callerId: myId,
                            callerName: inviter?.name?.trim() || 'Caller',
                            callerImage: inviter?.profileImage ?? null,
                            at: new Date().toISOString(),
                        });
                    }
                    ack?.({ ok: false, error: 'Busy on another call.' });
                    return;
                }
                (0, callInviteRegistry_1.registerPendingCallInvite)(receiverForInviteId);
                (0, callQueue_1.removeReceiverFromQueue)(receiverForInviteId);
                const timeoutHandle = setTimeout(() => {
                    const invite = activeCallInvites.get(callId);
                    if (!invite)
                        return;
                    activeCallInvites.delete(callId);
                    (0, callInviteRegistry_1.unregisterPendingCallInvite)(invite.receiverId);
                    (0, callQueue_1.releaseReceiverReservation)(invite.receiverId);
                    void (0, callQueue_1.syncReceiverQueueState)(invite.receiverId);
                    io.to(accountRoom(invite.inviterType, invite.inviterId)).emit('call:response', {
                        callId,
                        accepted: false,
                        fromType: invite.targetType,
                        fromId: invite.targetId,
                    });
                }, 30000);
                activeCallInvites.set(callId, {
                    callId,
                    inviterId: myId,
                    inviterType: typ,
                    targetId,
                    targetType,
                    receiverId: receiverForInviteId,
                    timeoutHandle,
                });
                let fromName = '';
                let fromImage = null;
                if (typ === 'u') {
                    const inviter = await User_1.default.findById(myId).select('name profileImage').lean();
                    fromName = inviter?.name?.trim() || 'Caller';
                    fromImage = inviter?.profileImage ?? null;
                }
                else {
                    const inviter = await Receiver_1.default.findById(myId).select('name profileImage').lean();
                    fromName = inviter?.name?.trim() || 'Receiver';
                    fromImage = inviter?.profileImage ?? null;
                }
                io.to(accountRoom(targetType, targetId)).emit('call:incoming', {
                    callId,
                    fromType: typ,
                    fromId: myId,
                    fromName,
                    fromImage,
                });
                ack?.({ ok: true });
            })();
        });
        socket.on('call:response', (payload, ack) => {
            const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
            const accepted = typeof payload?.accepted === 'boolean' ? payload.accepted : null;
            if (!callId || accepted === null) {
                ack?.({ ok: false, error: 'callId and accepted are required' });
                return;
            }
            const invite = activeCallInvites.get(callId);
            if (!invite) {
                ack?.({ ok: false, error: 'Unknown call invite' });
                return;
            }
            if (invite.timeoutHandle) {
                clearTimeout(invite.timeoutHandle);
                invite.timeoutHandle = null;
            }
            const responderId = String(socket.data.accountId);
            const responderType = socket.data.typ;
            const isExpectedResponder = responderId === invite.targetId && responderType === invite.targetType;
            if (!isExpectedResponder) {
                ack?.({ ok: false, error: 'Forbidden' });
                return;
            }
            io.to(accountRoom(invite.inviterType, invite.inviterId)).emit('call:response', {
                callId,
                accepted,
                fromType: responderType,
                fromId: responderId,
            });
            io.to(accountRoom(invite.targetType, invite.targetId)).emit('call:response', {
                callId,
                accepted,
                fromType: responderType,
                fromId: responderId,
            });
            if (!accepted) {
                activeCallInvites.delete(callId);
                (0, callInviteRegistry_1.unregisterPendingCallInvite)(invite.receiverId);
                (0, callQueue_1.releaseReceiverReservation)(invite.receiverId);
                void (0, callQueue_1.syncReceiverQueueState)(invite.receiverId);
            }
            ack?.({ ok: true });
        });
        socket.on('call:end', (payload, ack) => {
            const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
            if (!callId) {
                ack?.({ ok: false, error: 'callId is required' });
                return;
            }
            const endedByType = socket.data.typ;
            const endedById = String(socket.data.accountId);
            const invite = activeCallInvites.get(callId);
            if (invite) {
                if (invite.timeoutHandle) {
                    clearTimeout(invite.timeoutHandle);
                    invite.timeoutHandle = null;
                }
                io.to(accountRoom(invite.inviterType, invite.inviterId)).emit('call:ended', {
                    callId,
                    fromType: endedByType,
                    fromId: endedById,
                });
                io.to(accountRoom(invite.targetType, invite.targetId)).emit('call:ended', {
                    callId,
                    fromType: endedByType,
                    fromId: endedById,
                });
                activeCallInvites.delete(callId);
                void settleAndReleaseCall(callId, invite.receiverId);
                ack?.({ ok: true });
                return;
            }
            void (async () => {
                try {
                    const session = await CallSession_1.default.findOne({ callId, status: 'ongoing' })
                        .select('callerId receiverId')
                        .lean();
                    if (!session) {
                        ack?.({ ok: true });
                        return;
                    }
                    const callerId = String(session.callerId);
                    const receiverId = String(session.receiverId);
                    const isParticipant = (endedByType === 'u' && endedById === callerId) ||
                        (endedByType === 'r' && endedById === receiverId);
                    if (!isParticipant) {
                        ack?.({ ok: false, error: 'Forbidden' });
                        return;
                    }
                    io.to(accountRoom('u', callerId)).emit('call:ended', {
                        callId,
                        fromType: endedByType,
                        fromId: endedById,
                    });
                    io.to(accountRoom('r', receiverId)).emit('call:ended', {
                        callId,
                        fromType: endedByType,
                        fromId: endedById,
                    });
                    (0, callInviteRegistry_1.unregisterPendingCallInvite)(receiverId);
                    (0, callQueue_1.releaseReceiverReservation)(receiverId);
                    void (0, callQueue_1.syncReceiverQueueState)(receiverId);
                }
                catch {
                    ack?.({ ok: false, error: 'Server error' });
                    return;
                }
                ack?.({ ok: true });
            })();
        });
    });
    (0, socketRegistry_1.registerSocketIOServer)(io);
    return io;
}
