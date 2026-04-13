import type { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import ChatMessage from '../models/ChatMessage';

type JwtPayload = { id: string; typ: 'u' | 'r' };

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

/**
 * Real-time 1:1 chat between an app user (`users`) and a receiver (`receivers`).
 * Client authenticates with the same JWT as REST (`handshake.auth.token`).
 */
export function attachChatSocket(httpServer: HTTPServer): Server {
  const io = new Server(httpServer, {
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
      const decoded = jwt.verify(token, secret) as JwtPayload;
      if (decoded.typ !== 'u' && decoded.typ !== 'r') {
        next(new Error('invalid token'));
        return;
      }
      socket.data.typ = decoded.typ;
      socket.data.accountId = decoded.id;
      next();
    } catch {
      next(new Error('auth failed'));
    }
  });

  io.on('connection', (socket) => {
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
          } else {
            const uid = typeof payload?.userId === 'string' ? payload.userId.trim() : '';
            if (!mongoose.Types.ObjectId.isValid(uid)) {
              ack?.({ ok: false, error: 'Invalid userId' });
              return;
            }
            userHex = uid;
            receiverHex = myId;
          }
          const prevRoom = socket.data.chatRoom as string | undefined;
          if (prevRoom) {
            await socket.leave(prevRoom);
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
          const doc = await ChatMessage.create({
            userId: parsed.userId,
            receiverId: parsed.receiverId,
            senderType: typ,
            text,
          });
          const out = {
            id: String(doc._id),
            senderType: typ,
            text: doc.text,
            createdAt: doc.createdAt.toISOString(),
          };
          io.to(room).emit('chat:newMessage', out);
          ack?.({ ok: true, message: out });
        } catch (err) {
          console.error(err);
          ack?.({ ok: false, error: 'Failed to send' });
        }
      })();
    });
  });

  return io;
}
