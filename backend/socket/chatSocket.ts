import type { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import ChatMessage, { type ChatMessageDocument } from '../models/ChatMessage';
import ChatBlock from '../models/ChatBlock';
import CallSession from '../models/CallSession';
import { callerHasSuccessfulCallWithReceiver } from '../utils/callerMessageEligibility';
import User from '../models/User';
import Receiver from '../models/Receiver';
import { getPayloadSessionVersion, type AppJwtPayload } from '../utils/authToken';
import { isReceiverSocketConnected, registerSocketIOServer } from './socketRegistry';
import { CHAT_TEXT_CHARGE_INR, CHAT_TEXT_EARN_INR } from '../constants/chatPricing';
import { recordReceiverCallScore } from '../services/receiverScore';
import { scheduleCallerOnlineNotifications } from '../services/callerOnlineNotifier';
import { scheduleReceiverAvailabilityNotifications } from '../services/receiverAvailabilityNotifier';
import { registerPendingCallInvite, unregisterPendingCallInvite } from '../services/callInviteRegistry';
import {
  ensureCallEndedAndSettled,
  MISSED_OR_INCOMPLETE_MAX_SEC,
} from '../controllers/callController';
import {
  isReceiverBusy,
  releaseIfStaleReceiverBusy,
  releaseReceiverReservation,
  removeReceiverFromQueue,
  setReceiverQueuePresence,
  syncReceiverQueueState,
  tryReserveReceiver,
} from '../services/callQueue';
import { sendReceiverIncomingCallPush } from '../services/expoPush';
import { syncReceiverPresenceInDatabase } from '../services/receiverPresence';

type CallInvitePayload = { callId?: unknown; targetId?: unknown };
type CallResponsePayload = { callId?: unknown; accepted?: unknown };
type CallEndPayload = { callId?: unknown };
type CallHoldPayload = { callId?: unknown; onHold?: unknown };
type CallQueuePayload = { active?: unknown };
type ChatTypingPayload = { typing?: unknown };
type AccountType = 'u' | 'r';

type ActiveCallInvite = {
  callId: string;
  inviterId: string;
  inviterType: AccountType;
  targetId: string;
  targetType: AccountType;
  receiverId: string;
  invitedAt: Date;
  timeoutHandle: NodeJS.Timeout | null;
};

function inviteCallerId(invite: ActiveCallInvite): string {
  return invite.inviterType === 'u' ? invite.inviterId : invite.targetId;
}

export function roomKey(userId: string, receiverId: string): string {
  return `chat:${userId}:${receiverId}`;
}

function parseRoom(room: string): { userId: string; receiverId: string } | null {
  const prefix = 'chat:';
  if (!room.startsWith(prefix)) return null;
  const rest = room.slice(prefix.length);
  const colon = rest.indexOf(':');
  if (colon <= 0) return null;
  const userId = rest.slice(0, colon);
  const receiverId = rest.slice(colon + 1);
  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(receiverId)) return null;
  return { userId, receiverId };
}

/** Normalize ObjectId strings so account rooms match across JWT, REST, and clients. */
function toMongoRoomId(raw: string): string {
  const s = String(raw).trim();
  if (mongoose.Types.ObjectId.isValid(s)) {
    return new mongoose.Types.ObjectId(s).toString();
  }
  return s;
}

function accountRoom(typ: AccountType, accountId: string): string {
  return `account:${typ}:${toMongoRoomId(accountId)}`;
}

/**
 * Real-time 1:1 chat between an app user (`users`) and a receiver (`receivers`).
 * Client authenticates with the same JWT as REST (`handshake.auth.token`).
 */
export function attachChatSocket(httpServer: HTTPServer): Server {
  const activeCallInvites = new Map<string, ActiveCallInvite>();
  const waitingCallQueueAccounts = new Set<string>();
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });
  const DISCONNECT_GRACE_MS = 5000;

  const queueKey = (typ: AccountType, accountId: string): string => `${typ}:${String(accountId).trim()}`;
  const hasActiveSocketForAccount = (typ: AccountType, accountId: string): boolean =>
    (io.sockets.adapter.rooms.get(accountRoom(typ, accountId))?.size ?? 0) > 0;
  const emitReceiverMissedCall = async (callerId: string, receiverId: string): Promise<void> => {
    const caller = await User.findById(callerId).select('name profileImage').lean<{
      name?: string;
      profileImage?: string | null;
    } | null>();
    io.to(accountRoom('r', receiverId)).emit('call:missed', {
      callerId,
      callerName: caller?.name?.trim() || 'Caller',
      callerImage: caller?.profileImage ?? null,
      at: new Date().toISOString(),
    });
  };

  const settleAndReleaseCall = async (
    callId: string,
    receiverId: string,
    callerId: string,
    startedAt?: Date
  ): Promise<void> => {
    try {
      const settled = await ensureCallEndedAndSettled(callId, { callerId, receiverId, startedAt });
      if (settled.justCompleted && settled.durationSec < MISSED_OR_INCOMPLETE_MAX_SEC) {
        await emitReceiverMissedCall(settled.callerId, settled.receiverId);
      }
      if (settled.justCompleted) {
        void recordReceiverCallScore({
          callId,
          receiverId: settled.receiverId,
          callerId: settled.callerId,
          startedAt: settled.startedAt,
          durationSec: settled.durationSec,
        }).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('receiver call score record error (socket):', msg);
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('socket settleAndReleaseCall error:', msg);
    } finally {
      unregisterPendingCallInvite(receiverId);
      releaseReceiverReservation(receiverId);
      await syncReceiverQueueState(receiverId);
    }
  };
  const cancelPendingInvitesFor = (typ: AccountType, accountId: string): void => {
    for (const [callId, invite] of activeCallInvites) {
      const isTarget = invite.targetType === typ && invite.targetId === accountId;
      const isInviter = invite.inviterType === typ && invite.inviterId === accountId;
      if (!isTarget && !isInviter) continue;
      if (invite.timeoutHandle) {
        clearTimeout(invite.timeoutHandle);
        invite.timeoutHandle = null;
      }
      activeCallInvites.delete(callId);
      void settleAndReleaseCall(callId, invite.receiverId, inviteCallerId(invite), invite.invitedAt);
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
        const decoded = jwt.verify(token, secret) as AppJwtPayload;
        if (decoded.typ !== 'u' && decoded.typ !== 'r') {
          next(new Error('invalid token'));
          return;
        }
        const tokenSv = getPayloadSessionVersion(decoded);
        if (decoded.typ === 'u') {
          const user = await User.findById(decoded.id).select('authSessionVersion');
          if (!user) {
            next(new Error('auth failed'));
            return;
          }
          const dbSv = typeof user.authSessionVersion === 'number' ? user.authSessionVersion : 0;
          if (tokenSv !== dbSv) {
            next(new Error('session superseded'));
            return;
          }
        } else {
          const receiver = await Receiver.findById(decoded.id).select('authSessionVersion');
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
      } catch {
        next(new Error('auth failed'));
      }
    })();
  });

  io.on('connection', async (socket) => {
    const socketType = socket.data.typ as AccountType;
    const socketAccountId = String(socket.data.accountId);
    const selfRoom = accountRoom(socketType, socketAccountId);
    // Socket.IO v4: join() is async; callers must not see an empty account room while DB already shows online.
    const hadActiveSocketBeforeJoin =
      (io.sockets.adapter.rooms.get(selfRoom)?.size ?? 0) > 0;
    try {
      await socket.join(selfRoom);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('socket join account room failed:', msg);
      socket.disconnect(true);
      return;
    }
    if (socketType === 'u' && !hadActiveSocketBeforeJoin) {
      void (async () => {
        try {
          await scheduleCallerOnlineNotifications(socketAccountId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('caller online notify error:', msg);
        }
      })();
    }
    if (socketType === 'r') {
      void (async () => {
        try {
          const prev = await Receiver.findById(socketAccountId)
            .select('isOnline isAvailable accountStatus suspended onlineSince')
            .lean();
          await syncReceiverPresenceInDatabase(socketAccountId);
          if (
            prev &&
            !prev.isOnline &&
            prev.isAvailable &&
            isReceiverSocketConnected(socketAccountId) &&
            prev.accountStatus === 'approved' &&
            !prev.suspended
          ) {
            await scheduleReceiverAvailabilityNotifications(socketAccountId);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('receiver online notify error:', msg);
        }
      })();
    }

    socket.on('disconnect', () => {
      const leavingId = String(socket.data.accountId);
      const leavingType = socket.data.typ as AccountType;
      setTimeout(() => {
        void (async () => {
          if (hasActiveSocketForAccount(leavingType, leavingId)) return;
          if (leavingType === 'r') {
            await syncReceiverPresenceInDatabase(leavingId);
          }
          waitingCallQueueAccounts.delete(queueKey(leavingType, leavingId));
          if (leavingType === 'r') {
            setReceiverQueuePresence(leavingId, false);
          }
          cancelPendingInvitesFor(leavingType, leavingId);
          for (const [callId, invite] of activeCallInvites) {
            if (
              (invite.inviterId === leavingId && invite.inviterType === leavingType) ||
              (invite.targetId === leavingId && invite.targetType === leavingType)
            ) {
              if (invite.timeoutHandle) {
                clearTimeout(invite.timeoutHandle);
                invite.timeoutHandle = null;
              }
              activeCallInvites.delete(callId);
              void settleAndReleaseCall(
                callId,
                invite.receiverId,
                inviteCallerId(invite),
                invite.invitedAt
              );
            }
          }
        })();
      }, DISCONNECT_GRACE_MS);
      if (leavingType === 'r') {
        setTimeout(() => {
          const stillConnected = hasActiveSocketForAccount('r', leavingId);
          if (!stillConnected) {
            void (async () => {
              await syncReceiverPresenceInDatabase(leavingId);
              releaseReceiverReservation(leavingId);
            })();
          }
        }, 300);
      }
    });

    socket.on('chat:join', (payload: { receiverId?: unknown; userId?: unknown }, ack?: (r: unknown) => void) => {
      void (async () => {
        try {
          const typ = socket.data.typ as 'u' | 'r';
          const myId = String(socket.data.accountId);
          let userHex: string;
          let receiverHex: string;
          if (typ === 'u') {
            const rid = typeof payload?.receiverId === 'string' ? payload.receiverId.trim() : '';
            if (!mongoose.Types.ObjectId.isValid(rid)) {
              ack?.({ ok: false, error: 'Invalid receiverId' });
              return;
            }
            userHex = myId;
            receiverHex = rid;
            const u = await User.findById(myId).select('accountStatus suspended');
            if (!u || u.suspended || u.accountStatus !== 'approved') {
              ack?.({ ok: false, error: 'Account not allowed' });
              return;
            }
            const recv = await Receiver.findById(rid).select('accountStatus suspended');
            if (!recv || recv.accountStatus !== 'approved' || recv.suspended) {
              ack?.({ ok: false, error: 'Cannot join this chat' });
              return;
            }
          } else {
            const uid = typeof payload?.userId === 'string' ? payload.userId.trim() : '';
            if (!mongoose.Types.ObjectId.isValid(uid)) {
              ack?.({ ok: false, error: 'Invalid userId' });
              return;
            }
            userHex = uid;
            receiverHex = myId;
            const recv = await Receiver.findById(myId).select('accountStatus suspended');
            if (!recv || recv.accountStatus !== 'approved' || recv.suspended) {
              ack?.({ ok: false, error: 'Account not allowed' });
              return;
            }
            const u = await User.findById(uid).select('accountStatus suspended');
            if (!u || u.suspended || u.accountStatus !== 'approved') {
              ack?.({ ok: false, error: 'Cannot join this chat' });
              return;
            }
          }
          const prevRoom = socket.data.chatRoom as string | undefined;
          if (prevRoom) {
            await socket.leave(prevRoom);
          }
          if (await ChatBlock.exists({ userId: userHex, receiverId: receiverHex })) {
            ack?.({ ok: false, error: 'This chat is blocked.' });
            return;
          }
          if (typ === 'u' && !(await callerHasSuccessfulCallWithReceiver(userHex, receiverHex))) {
            ack?.({
              ok: false,
              code: 'CALL_REQUIRED',
              error: 'Complete at least one successful call with this receiver before messaging.',
            });
            return;
          }

          const room = roomKey(userHex, receiverHex);
          await socket.join(room);
          socket.data.chatRoom = room;
          ack?.({ ok: true });
        } catch (err) {
          ack?.({ ok: false, error: err instanceof Error ? err.message : 'join failed' });
        }
      })();
    });

    socket.on('chat:leave', (_payload: unknown, ack?: (r: unknown) => void) => {
      void (async () => {
        const room = socket.data.chatRoom as string | undefined;
        if (room) {
          await socket.leave(room);
        }
        socket.data.chatRoom = undefined;
        ack?.({ ok: true });
      })();
    });

    socket.on('chat:message', (payload: { text?: unknown }, ack?: (r: unknown) => void) => {
      void (async () => {
        try {
          const room = socket.data.chatRoom as string | undefined;
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
          const typ = socket.data.typ as 'u' | 'r';
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
            const u = await User.findById(myId).select('accountStatus suspended');
            if (!u || u.suspended || u.accountStatus !== 'approved') {
              ack?.({ ok: false, error: 'Account not allowed' });
              return;
            }
          } else {
            const recv = await Receiver.findById(myId).select('accountStatus suspended');
            if (!recv || recv.accountStatus !== 'approved' || recv.suspended) {
              ack?.({ ok: false, error: 'Account not allowed' });
              return;
            }
          }

          if (await ChatBlock.exists({ userId: parsed.userId, receiverId: parsed.receiverId })) {
            ack?.({ ok: false, error: 'This chat is blocked.' });
            return;
          }
          if (
            typ === 'u' &&
            !(await callerHasSuccessfulCallWithReceiver(parsed.userId, parsed.receiverId))
          ) {
            ack?.({
              ok: false,
              code: 'CALL_REQUIRED',
              error: 'Complete at least one successful call with this receiver before messaging.',
            });
            return;
          }

          let doc!: ChatMessageDocument;

          const uidObj = new mongoose.Types.ObjectId(parsed.userId);
          const ridObj = new mongoose.Types.ObjectId(parsed.receiverId);

          if (typ === 'u') {
            const hasReceiverReply = await ChatMessage.exists({
              userId: uidObj,
              receiverId: ridObj,
              senderType: 'r',
            });
            const needCharge = Boolean(hasReceiverReply);

            if (needCharge) {
              const session = await mongoose.startSession();
              try {
                await session.withTransaction(async () => {
                  const usrUpd = await User.updateOne(
                    { _id: uidObj, walletBalance: { $gte: CHAT_TEXT_CHARGE_INR } },
                    { $inc: { walletBalance: -CHAT_TEXT_CHARGE_INR } },
                    { session }
                  );
                  if (usrUpd.modifiedCount === 0) {
                    throw new Error('INSUFFICIENT_WALLET');
                  }
                  const recvUpd = await Receiver.updateOne(
                    { _id: ridObj },
                    { $inc: { walletBalance: CHAT_TEXT_EARN_INR } },
                    { session }
                  );
                  if (recvUpd.modifiedCount !== 1) {
                    throw new Error('RECEIVER_CREDIT_FAILED');
                  }
                  const created = await ChatMessage.create(
                    [
                      {
                        userId: uidObj,
                        receiverId: ridObj,
                        senderType: typ,
                        text,
                        feeInr: CHAT_TEXT_EARN_INR,
                      },
                    ],
                    { session }
                  );
                  doc = created[0]!;
                });
              } catch (e) {
                if (e instanceof Error && e.message === 'INSUFFICIENT_WALLET') {
                  const uDoc = await User.findById(uidObj).select('walletBalance');
                  ack?.({
                    ok: false,
                    code: 'INSUFFICIENT_WALLET',
                    error: 'Wallet balance is too low to send this message.',
                    walletBalance:
                      typeof uDoc?.walletBalance === 'number' && Number.isFinite(uDoc.walletBalance)
                        ? uDoc.walletBalance
                        : 0,
                    requiredInr: CHAT_TEXT_CHARGE_INR,
                  });
                  return;
                }
                if (e instanceof Error && e.message === 'RECEIVER_CREDIT_FAILED') {
                  console.error('Receiver wallet credit failed', { userId: parsed.userId, receiverId: parsed.receiverId });
                  ack?.({ ok: false, error: 'Could not update receiver wallet. Try again.' });
                  return;
                }
                throw e;
              } finally {
                await session.endSession();
              }

              const [freshCaller, freshRecv] = await Promise.all([
                User.findById(uidObj).select('walletBalance'),
                Receiver.findById(ridObj).select('walletBalance'),
              ]);
              io.to(room).emit('chat:wallet', {
                callerWallet:
                  typeof freshCaller?.walletBalance === 'number' &&
                  Number.isFinite(freshCaller.walletBalance)
                    ? freshCaller.walletBalance
                    : 0,
                receiverWallet:
                  typeof freshRecv?.walletBalance === 'number' && Number.isFinite(freshRecv.walletBalance)
                    ? freshRecv.walletBalance
                    : 0,
              });
            } else {
              doc = await ChatMessage.create({
                userId: uidObj,
                receiverId: ridObj,
                senderType: typ,
                text,
                feeInr: 0,
              });
            }
          } else {
            doc = await ChatMessage.create({
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
        } catch (err) {
          console.error(err);
          ack?.({ ok: false, error: 'Failed to send' });
        }
      })();
    });

    socket.on('chat:typing', (payload: ChatTypingPayload, ack?: (r: unknown) => void) => {
      const room = socket.data.chatRoom as string | undefined;
      if (!room) {
        ack?.({ ok: false, error: 'Join a chat first' });
        return;
      }
      const parsed = parseRoom(room);
      if (!parsed) {
        ack?.({ ok: false, error: 'Bad room' });
        return;
      }
      const typ = socket.data.typ as AccountType;
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
      } else {
        io.to(accountRoom('u', parsed.userId)).emit('chat:typing', {
          peerId: parsed.receiverId,
          fromType: typ,
          fromId,
          typing,
        });
      }
      ack?.({ ok: true });
    });

    socket.on('call:queue:set', (payload: CallQueuePayload, ack?: (r: unknown) => void) => {
      const typ = socket.data.typ as AccountType;
      const accountId = String(socket.data.accountId);
      const active = Boolean(payload?.active);
      const key = queueKey(typ, accountId);
      if (active) {
        waitingCallQueueAccounts.add(key);
        if (typ === 'r') {
          setReceiverQueuePresence(accountId, true);
        }
      } else {
        waitingCallQueueAccounts.delete(key);
        if (typ === 'r') {
          setReceiverQueuePresence(accountId, false);
        }
        cancelPendingInvitesFor(typ, accountId);
      }
      ack?.({ ok: true, active });
    });

    socket.on('call:invite', (payload: CallInvitePayload, ack?: (r: unknown) => void) => {
      void (async () => {
        const typ = socket.data.typ as AccountType;
        const myId = String(socket.data.accountId);
        const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
        const targetId = typeof payload?.targetId === 'string' ? payload.targetId.trim() : '';
        if (!callId) {
          ack?.({ ok: false, error: 'callId is required' });
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(targetId)) {
          ack?.({ ok: false, error: 'targetId is required' });
          return;
        }

        const targetType: AccountType = typ === 'u' ? 'r' : 'u';
        let userId: string;
        let receiverId: string;
        if (typ === 'u') {
          userId = myId;
          receiverId = targetId;
        } else {
          userId = targetId;
          receiverId = myId;
        }

        if (await ChatBlock.exists({ userId, receiverId })) {
          ack?.({ ok: false, error: 'This chat is blocked.' });
          return;
        }

        let receiverForInviteId = '';
        if (typ === 'u') {
          const recv = await Receiver.findById(targetId).select('accountStatus suspended isAvailable isOnline');
          if (
            !recv ||
            recv.accountStatus !== 'approved' ||
            recv.suspended ||
            !recv.isAvailable
          ) {
            ack?.({ ok: false, error: 'Cannot call this receiver right now.' });
            return;
          }
          if (!hasActiveSocketForAccount('r', targetId)) {
            ack?.({ ok: false, error: 'Receiver is offline right now.' });
            return;
          }
          receiverForInviteId = targetId;
          await releaseIfStaleReceiverBusy(receiverForInviteId);
          const notifyReceiverBusyMissedCall = async (): Promise<void> => {
            const inviter = await User.findById(myId).select('name profileImage').lean<{
              name?: string;
              profileImage?: string | null;
            } | null>();
            io.to(accountRoom('r', targetId)).emit('call:missed', {
              callerId: myId,
              callerName: inviter?.name?.trim() || 'Caller',
              callerImage: inviter?.profileImage ?? null,
              at: new Date().toISOString(),
            });
          };
          if (isReceiverBusy(receiverForInviteId)) {
            await notifyReceiverBusyMissedCall();
            ack?.({ ok: false, error: 'Busy on another call.' });
            return;
          }
        } else {
          const recv = await Receiver.findById(myId).select('accountStatus suspended isAvailable');
          if (
            !recv ||
            recv.accountStatus !== 'approved' ||
            recv.suspended ||
            !recv.isAvailable ||
            !hasActiveSocketForAccount('r', myId)
          ) {
            ack?.({ ok: false, error: 'You are not available for calls right now.' });
            return;
          }
          receiverForInviteId = myId;
          await releaseIfStaleReceiverBusy(receiverForInviteId);
          if (isReceiverBusy(receiverForInviteId)) {
            ack?.({ ok: false, error: 'Busy on another call.' });
            return;
          }
          const usr = await User.findById(targetId).select('accountStatus suspended');
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

        if (!tryReserveReceiver(receiverForInviteId)) {
          if (typ === 'u') {
            const inviter = await User.findById(myId).select('name profileImage').lean<{
              name?: string;
              profileImage?: string | null;
            } | null>();
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
        registerPendingCallInvite(receiverForInviteId);
        removeReceiverFromQueue(receiverForInviteId);
        const invitedAt = new Date();
        const timeoutHandle = setTimeout(() => {
          const invite = activeCallInvites.get(callId);
          if (!invite) return;
          activeCallInvites.delete(callId);
          void settleAndReleaseCall(
            callId,
            invite.receiverId,
            inviteCallerId(invite),
            invite.invitedAt
          );
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
          invitedAt,
          timeoutHandle,
        });

        let fromName = '';
        let fromImage: string | null = null;
        if (typ === 'u') {
          const inviter = await User.findById(myId).select('name profileImage').lean<{
            name?: string;
            profileImage?: string | null;
          } | null>();
          fromName = inviter?.name?.trim() || 'Caller';
          fromImage = inviter?.profileImage ?? null;
        } else {
          const inviter = await Receiver.findById(myId).select('name profileImage').lean<{
            name?: string;
            profileImage?: string | null;
          } | null>();
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
        if (targetType === 'r') {
          void (async () => {
            try {
              const recv = await Receiver.findById(targetId)
                .select('expoPushToken isAvailable')
                .lean<{ expoPushToken?: string | null; isAvailable?: boolean } | null>();
              const pushToken = recv?.expoPushToken?.trim();
              if (recv?.isAvailable && pushToken) {
                await sendReceiverIncomingCallPush({
                  expoPushToken: pushToken,
                  callId,
                  fromId: myId,
                  fromName,
                  fromImage,
                });
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error('incoming call push error:', msg);
            }
          })();
        }
        ack?.({ ok: true });
      })();
    });

    socket.on('call:response', (payload: CallResponsePayload, ack?: (r: unknown) => void) => {
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
      const responderType = socket.data.typ as AccountType;
      const isExpectedResponder =
        responderId === invite.targetId && responderType === invite.targetType;
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
        void settleAndReleaseCall(
          callId,
          invite.receiverId,
          inviteCallerId(invite),
          invite.invitedAt
        );
      }
      ack?.({ ok: true });
    });

    socket.on('call:hold', (payload: CallHoldPayload, ack?: (r: unknown) => void) => {
      const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
      const onHold = typeof payload?.onHold === 'boolean' ? payload.onHold : null;
      if (!callId || onHold === null) {
        ack?.({ ok: false, error: 'callId and onHold are required' });
        return;
      }
      const fromType = socket.data.typ as AccountType;
      const fromId = String(socket.data.accountId);
      void (async () => {
        try {
          const session = await CallSession.findOne({ callId, status: 'ongoing' })
            .select('callerId receiverId')
            .lean<{ callerId: mongoose.Types.ObjectId; receiverId: mongoose.Types.ObjectId } | null>();
          if (!session) {
            ack?.({ ok: false, error: 'Call not active' });
            return;
          }
          const callerId = String(session.callerId);
          const receiverId = String(session.receiverId);
          const isParticipant =
            (fromType === 'u' && fromId === callerId) || (fromType === 'r' && fromId === receiverId);
          if (!isParticipant) {
            ack?.({ ok: false, error: 'Forbidden' });
            return;
          }
          const peerType: AccountType = fromType === 'u' ? 'r' : 'u';
          const peerId = fromType === 'u' ? receiverId : callerId;
          io.to(accountRoom(peerType, peerId)).emit('call:hold', {
            callId,
            onHold,
            fromType,
            fromId,
          });
          ack?.({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('call:hold error:', msg);
          ack?.({ ok: false, error: 'Server error' });
        }
      })();
    });

    socket.on('call:end', (payload: CallEndPayload, ack?: (r: unknown) => void) => {
      const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
      if (!callId) {
        ack?.({ ok: false, error: 'callId is required' });
        return;
      }
      const endedByType = socket.data.typ as AccountType;
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
        void settleAndReleaseCall(
          callId,
          invite.receiverId,
          inviteCallerId(invite),
          invite.invitedAt
        );
        ack?.({ ok: true });
        return;
      }

      void (async () => {
        try {
          const session = await CallSession.findOne({ callId })
            .select('callerId receiverId status')
            .lean<{ callerId: unknown; receiverId: unknown; status: string } | null>();
          if (!session) {
            ack?.({ ok: true });
            return;
          }
          const callerId = String(session.callerId);
          const receiverId = String(session.receiverId);
          const isParticipant =
            (endedByType === 'u' && endedById === callerId) ||
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
          await settleAndReleaseCall(callId, receiverId, callerId);
        } catch {
          ack?.({ ok: false, error: 'Server error' });
          return;
        }
        ack?.({ ok: true });
      })();
    });
  });

  registerSocketIOServer(io);
  return io;
}
