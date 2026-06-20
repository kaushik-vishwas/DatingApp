import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import ChatMessage from '../models/ChatMessage';
import ChatBlock from '../models/ChatBlock';
import ChatReadState from '../models/ChatReadState';
import UserReport, { REPORT_REASONS, type ReportReason } from '../models/UserReport';
import { blockCallerUntilApproved, blockReceiverUntilApproved } from '../utils/accountAccess';
import { callerHasSuccessfulCallWithReceiver } from '../utils/callerMessageEligibility';

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
      if (blockCallerUntilApproved(req, res)) return;
      const receiverId = typeof req.query.receiverId === 'string' ? req.query.receiverId.trim() : '';
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        res.status(400).json({ message: 'receiverId is required' });
        return;
      }
      const userId = String(req.user!._id);
      if (await ChatBlock.exists({ userId, receiverId })) {
        res.status(403).json({ message: 'This conversation is blocked.' });
        return;
      }
      if (!(await callerHasSuccessfulCallWithReceiver(userId, receiverId))) {
        res.status(403).json({
          message: 'Complete at least one successful call with this receiver before messaging.',
          code: 'CALL_REQUIRED',
        });
        return;
      }
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

    if (blockReceiverUntilApproved(req, res)) return;
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ message: 'userId is required' });
      return;
    }
    const receiverId = String(req.receiver!._id);
    if (await ChatBlock.exists({ userId, receiverId })) {
      res.status(403).json({ message: 'This conversation is blocked.' });
      return;
    }
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
      if (blockCallerUntilApproved(req, res)) return;
      const uid = new mongoose.Types.ObjectId(String(req.user!._id));
      const blockedReceiverIds = await ChatBlock.distinct('receiverId', { userId: uid });
      const convoMatch: Record<string, unknown> = { userId: uid };
      if (blockedReceiverIds.length > 0) {
        convoMatch.receiverId = { $nin: blockedReceiverIds };
      }
      const rows = await ChatMessage.aggregate<{
        peerId: string;
        peerName: string;
        peerImage: string | null;
        lastText: string;
        lastAt: Date;
      }>([
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

      const userIdObj = new mongoose.Types.ObjectId(String(req.user!._id));
      const peerReceiverIds = rows
        .map((r) => r.peerId)
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const readStates = await ChatReadState.find({
        userId: userIdObj,
        receiverId: { $in: peerReceiverIds },
      })
        .select('receiverId userLastReadAt')
        .lean<{ receiverId: mongoose.Types.ObjectId; userLastReadAt: Date | null }[]>();
      const readAtByReceiver = new Map<string, Date | null>(
        readStates.map((s) => [String(s.receiverId), s.userLastReadAt ?? null])
      );

      const unreadCounts = await Promise.all(
        rows.map(async (r) => {
          const receiverObj = new mongoose.Types.ObjectId(r.peerId);
          const lastRead = readAtByReceiver.get(r.peerId) ?? null;
          const filter: Record<string, unknown> = {
            userId: userIdObj,
            receiverId: receiverObj,
            senderType: 'r',
          };
          if (lastRead) filter.createdAt = { $gt: lastRead };
          return ChatMessage.countDocuments(filter);
        })
      );
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
    if (blockReceiverUntilApproved(req, res)) return;

    const rid = new mongoose.Types.ObjectId(String(req.receiver!._id));
    const blockedUserIds = await ChatBlock.distinct('userId', { receiverId: rid });
    const recvConvoMatch: Record<string, unknown> = { receiverId: rid };
    if (blockedUserIds.length > 0) {
      recvConvoMatch.userId = { $nin: blockedUserIds };
    }
    const rows = await ChatMessage.aggregate<{
      peerId: string;
      peerName: string;
      peerImage: string | null;
      lastText: string;
      lastAt: Date;
    }>([
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

    const receiverIdObj = new mongoose.Types.ObjectId(String(req.receiver!._id));
    const peerUserIds = rows
      .map((r) => r.peerId)
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const readStates = await ChatReadState.find({
      receiverId: receiverIdObj,
      userId: { $in: peerUserIds },
    })
      .select('userId receiverLastReadAt')
      .lean<{ userId: mongoose.Types.ObjectId; receiverLastReadAt: Date | null }[]>();
    const readAtByUser = new Map<string, Date | null>(
      readStates.map((s) => [String(s.userId), s.receiverLastReadAt ?? null])
    );

    const unreadCounts = await Promise.all(
      rows.map(async (r) => {
        const userObj = new mongoose.Types.ObjectId(r.peerId);
        const lastRead = readAtByUser.get(r.peerId) ?? null;
        const filter: Record<string, unknown> = {
          userId: userObj,
          receiverId: receiverIdObj,
          senderType: 'u',
        };
        if (lastRead) filter.createdAt = { $gt: lastRead };
        return ChatMessage.countDocuments(filter);
      })
    );
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load conversations' });
  }
}

/**
 * POST /chat/mark-read — marks a conversation read for the current account.
 * Caller body: `{ receiverId }`; receiver body: `{ userId }`.
 */
export async function markConversationRead(req: Request, res: Response): Promise<void> {
  try {
    const kind = req.accountKind;
    if (kind === 'user') {
      if (blockCallerUntilApproved(req, res)) return;
      const receiverId = typeof req.body.receiverId === 'string' ? req.body.receiverId.trim() : '';
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        res.status(400).json({ message: 'receiverId is required' });
        return;
      }
      await ChatReadState.findOneAndUpdate(
        { userId: req.user!._id, receiverId: new mongoose.Types.ObjectId(receiverId) },
        { $set: { userLastReadAt: new Date() } },
        { upsert: true, new: true }
      );
      res.status(200).json({ ok: true });
      return;
    }

    if (kind === 'receiver') {
      if (blockReceiverUntilApproved(req, res)) return;
      const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'userId is required' });
        return;
      }
      await ChatReadState.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(userId), receiverId: req.receiver!._id },
        { $set: { receiverLastReadAt: new Date() } },
        { upsert: true, new: true }
      );
      res.status(200).json({ ok: true });
      return;
    }

    res.status(401).json({ message: 'Unauthorized' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to mark conversation as read' });
  }
}

function isReportReason(s: string): s is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(s);
}

/**
 * POST /chat/block — body: `{ receiverId }` (caller) or `{ userId }` (receiver).
 */
export async function blockChatPeer(req: Request, res: Response): Promise<void> {
  try {
    const kind = req.accountKind;
    if (kind === 'user') {
      if (blockCallerUntilApproved(req, res)) return;
      const receiverId = typeof req.body.receiverId === 'string' ? req.body.receiverId.trim() : '';
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        res.status(400).json({ message: 'receiverId is required' });
        return;
      }
      await ChatBlock.findOneAndUpdate(
        { userId: req.user!._id, receiverId },
        { $setOnInsert: { userId: req.user!._id, receiverId } },
        { upsert: true, new: true }
      );
      res.status(200).json({ ok: true });
      return;
    }
    if (kind === 'receiver') {
      if (blockReceiverUntilApproved(req, res)) return;
      const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'userId is required' });
        return;
      }
      await ChatBlock.findOneAndUpdate(
        { userId, receiverId: req.receiver!._id },
        { $setOnInsert: { userId, receiverId: req.receiver!._id } },
        { upsert: true, new: true }
      );
      res.status(200).json({ ok: true });
      return;
    }
    res.status(401).json({ message: 'Unauthorized' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to block' });
  }
}

/**
 * POST /chat/unblock — body: `{ receiverId }` (caller) or `{ userId }` (receiver).
 */
export async function unblockChatPeer(req: Request, res: Response): Promise<void> {
  try {
    const kind = req.accountKind;
    if (kind === 'user') {
      if (blockCallerUntilApproved(req, res)) return;
      const receiverId = typeof req.body.receiverId === 'string' ? req.body.receiverId.trim() : '';
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        res.status(400).json({ message: 'receiverId is required' });
        return;
      }
      await ChatBlock.deleteOne({ userId: req.user!._id, receiverId });
      res.status(200).json({ ok: true });
      return;
    }
    if (kind === 'receiver') {
      if (blockReceiverUntilApproved(req, res)) return;
      const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'userId is required' });
        return;
      }
      await ChatBlock.deleteOne({ userId, receiverId: req.receiver!._id });
      res.status(200).json({ ok: true });
      return;
    }
    res.status(401).json({ message: 'Unauthorized' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to unblock' });
  }
}

/**
 * GET /chat/block-status — query: `receiverId` (caller) or `userId` (receiver).
 */
export async function getChatBlockStatus(req: Request, res: Response): Promise<void> {
  try {
    const kind = req.accountKind;
    if (kind === 'user') {
      if (blockCallerUntilApproved(req, res)) return;
      const receiverId = typeof req.query.receiverId === 'string' ? req.query.receiverId.trim() : '';
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        res.status(400).json({ message: 'receiverId is required' });
        return;
      }
      const blocked = Boolean(await ChatBlock.exists({ userId: req.user!._id, receiverId }));
      res.status(200).json({ blocked });
      return;
    }
    if (kind === 'receiver') {
      if (blockReceiverUntilApproved(req, res)) return;
      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'userId is required' });
        return;
      }
      const blocked = Boolean(await ChatBlock.exists({ userId, receiverId: req.receiver!._id }));
      res.status(200).json({ blocked });
      return;
    }
    res.status(401).json({ message: 'Unauthorized' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch block status' });
  }
}

/**
 * POST /chat/report — body includes `reason` and optional `preview`; peer id key matches `/chat/block`.
 */
export async function reportChatPeer(req: Request, res: Response): Promise<void> {
  try {
    const kind = req.accountKind;
    const reasonRaw = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    const preview =
      typeof req.body.preview === 'string' ? req.body.preview.trim().slice(0, 500) : '';

    if (!isReportReason(reasonRaw)) {
      res.status(400).json({ message: 'Invalid reason' });
      return;
    }

    if (kind === 'user') {
      if (blockCallerUntilApproved(req, res)) return;
      const receiverId = typeof req.body.receiverId === 'string' ? req.body.receiverId.trim() : '';
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        res.status(400).json({ message: 'receiverId is required' });
        return;
      }
      await UserReport.create({
        reporterKind: 'user',
        reporterId: req.user!._id,
        reportedKind: 'receiver',
        reportedId: new mongoose.Types.ObjectId(receiverId),
        reason: reasonRaw,
        preview,
        status: 'pending',
        resolution: null,
      });
      res.status(201).json({ ok: true });
      return;
    }
    if (kind === 'receiver') {
      if (blockReceiverUntilApproved(req, res)) return;
      const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'userId is required' });
        return;
      }
      await UserReport.create({
        reporterKind: 'receiver',
        reporterId: req.receiver!._id,
        reportedKind: 'user',
        reportedId: new mongoose.Types.ObjectId(userId),
        reason: reasonRaw,
        preview,
        status: 'pending',
        resolution: null,
      });
      res.status(201).json({ ok: true });
      return;
    }
    res.status(401).json({ message: 'Unauthorized' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to submit report' });
  }
}

/**
 * POST /chat/clear — deletes message history for the pair (same body shape as `/chat/block`).
 */
export async function clearChatHistory(req: Request, res: Response): Promise<void> {
  try {
    const kind = req.accountKind;
    if (kind === 'user') {
      if (blockCallerUntilApproved(req, res)) return;
      const receiverId = typeof req.body.receiverId === 'string' ? req.body.receiverId.trim() : '';
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        res.status(400).json({ message: 'receiverId is required' });
        return;
      }
      const r = await ChatMessage.deleteMany({ userId: req.user!._id, receiverId });
      res.status(200).json({ ok: true, deletedCount: r.deletedCount ?? 0 });
      return;
    }
    if (kind === 'receiver') {
      if (blockReceiverUntilApproved(req, res)) return;
      const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'userId is required' });
        return;
      }
      const r = await ChatMessage.deleteMany({ userId, receiverId: req.receiver!._id });
      res.status(200).json({ ok: true, deletedCount: r.deletedCount ?? 0 });
      return;
    }
    res.status(401).json({ message: 'Unauthorized' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to clear chat' });
  }
}
