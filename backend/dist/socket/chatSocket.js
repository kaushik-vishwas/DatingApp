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
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const chatPricing_1 = require("../constants/chatPricing");
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
/**
 * Real-time 1:1 chat between an app user (`users`) and a receiver (`receivers`).
 * Client authenticates with the same JWT as REST (`handshake.auth.token`).
 */
function attachChatSocket(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
    });
    io.use((socket, next) => {
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
            socket.data.typ = decoded.typ;
            socket.data.accountId = decoded.id;
            next();
        }
        catch {
            next(new Error('auth failed'));
        }
    });
    io.on('connection', (socket) => {
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
                    ack?.({ ok: true, message: out });
                }
                catch (err) {
                    console.error(err);
                    ack?.({ ok: false, error: 'Failed to send' });
                }
            })();
        });
    });
    return io;
}
