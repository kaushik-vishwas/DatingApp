import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import ChatMessage from '../models/ChatMessage';

const HISTORY_LIMIT = 200;

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  try {
    const kind = req.accountKind;
    if (kind !== 'user' && kind !== 'receiver') {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    if (kind === 'user') {
      const receiverId = typeof req.query.receiverId === 'string' ? req.query.receiverId.trim() : '';
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        res.status(400).json({ message: 'receiverId is required' });
        return;
      }
      const userId = String(req.user!._id);
      const rows = await ChatMessage.find({ userId, receiverId })
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

    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ message: 'userId is required' });
      return;
    }
    const receiverId = String(req.receiver!._id);
    const rows = await ChatMessage.find({ userId, receiverId })
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load messages' });
  }
}

export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const kind = req.accountKind;
    if (kind === 'user') {
      const uid = new mongoose.Types.ObjectId(String(req.user!._id));
      const rows = await ChatMessage.aggregate<{
        peerId: string;
        peerName: string;
        peerImage: string | null;
        lastText: string;
        lastAt: Date;
      }>([
        { $match: { userId: uid } },
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
      res.json({
        conversations: rows.map((r) => ({
          peerId: r.peerId,
          peerName: r.peerName,
          peerImage: r.peerImage ?? null,
          lastText: r.lastText,
          lastAt: iso(r.lastAt),
        })),
      });
      return;
    }

    if (kind !== 'receiver') {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const rid = new mongoose.Types.ObjectId(String(req.receiver!._id));
    const rows = await ChatMessage.aggregate<{
      peerId: string;
      peerName: string;
      peerImage: string | null;
      lastText: string;
      lastAt: Date;
    }>([
      { $match: { receiverId: rid } },
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
    res.json({
      conversations: rows.map((r) => ({
        peerId: r.peerId,
        peerName: r.peerName,
        peerImage: r.peerImage ?? null,
        lastText: r.lastText,
        lastAt: iso(r.lastAt),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load conversations' });
  }
}
