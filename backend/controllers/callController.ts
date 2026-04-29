import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import ChatBlock from '../models/ChatBlock';
import User from '../models/User';
import Receiver from '../models/Receiver';
import CallSession from '../models/CallSession';
import {
  buildVoiceCallId,
  createStreamUserToken,
  getStreamApiKey,
  toStreamUserId,
} from '../utils/streamVoice';
import { pickRandomQueuedReceiverForCaller } from '../services/callQueue';
import { isReceiverBusy, releaseReceiverReservation, syncReceiverQueueState } from '../services/callQueue';
import { isReceiverInQueueScreen } from '../services/callQueue';

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const getRandomQueuedReceiver = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'user' || !req.user?._id) {
      res.status(403).json({ message: 'Only callers can use random call match' });
      return;
    }
    const callerId = String(req.user._id);
    const caller = await User.findById(callerId).select('accountStatus suspended');
    if (!caller || caller.accountStatus !== 'approved' || caller.suspended) {
      res.status(403).json({ message: 'Caller account is not allowed for calling' });
      return;
    }

    const timeoutMs = 10_000;
    const pollEveryMs = 1_000;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const matched = await pickRandomQueuedReceiverForCaller(callerId);
      if (matched) {
        res.status(200).json(matched);
        return;
      }
      await sleep(pollEveryMs);
    }

    res.status(404).json({ message: 'No available receiver found right now. Please try again shortly.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getRandomQueuedReceiver error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const getVoiceBootstrap = async (req: Request, res: Response): Promise<void> => {
  const accountKind = req.accountKind;
  const meId = accountKind === 'user' ? String(req.user?._id ?? '') : String(req.receiver?._id ?? '');
  const peerId = typeof req.query.peerId === 'string' ? req.query.peerId.trim() : '';
  if (!accountKind || !meId) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(peerId)) {
    res.status(400).json({ message: 'Valid peerId is required' });
    return;
  }

  const callerUserId = accountKind === 'user' ? meId : peerId;
  const receiverId = accountKind === 'receiver' ? meId : peerId;

  const [callerDoc, receiverDoc] = await Promise.all([
    User.findById(callerUserId).select('accountStatus suspended'),
    Receiver.findById(receiverId).select('accountStatus suspended audioCallRate isAvailable isOnline'),
  ]);

  if (!callerDoc || callerDoc.accountStatus !== 'approved' || callerDoc.suspended) {
    res.status(403).json({ message: 'Caller account is not allowed for calling' });
    return;
  }
  if (!receiverDoc || receiverDoc.accountStatus !== 'approved' || receiverDoc.suspended) {
    res.status(403).json({ message: 'Receiver account is not allowed for calling' });
    return;
  }
  const ongoing = await CallSession.exists({
    receiverId: new mongoose.Types.ObjectId(receiverId),
    status: 'ongoing',
  });
  if (ongoing || isReceiverBusy(receiverId)) {
    res.status(409).json({ message: 'Receiver is busy on another call' });
    return;
  }
  if (!isReceiverInQueueScreen(receiverId)) {
    res.status(409).json({ message: 'Receiver is not in waiting queue right now.' });
    return;
  }
  if (!receiverDoc.isAvailable || !receiverDoc.isOnline) {
    res.status(409).json({ message: 'Receiver is currently offline' });
    return;
  }
  if (await ChatBlock.exists({ userId: callerUserId, receiverId })) {
    res.status(403).json({ message: 'This pair is blocked for communication' });
    return;
  }

  const meStreamUserId = toStreamUserId(accountKind, meId);
  const peerStreamUserId = toStreamUserId(accountKind === 'user' ? 'receiver' : 'user', peerId);
  const { token, expiresAt } = createStreamUserToken(meStreamUserId);
  const callId = buildVoiceCallId(meStreamUserId, peerStreamUserId);

  res.json({
    apiKey: getStreamApiKey(),
    token,
    tokenExpiresAt: expiresAt,
    streamUserId: meStreamUserId,
    peerStreamUserId,
    peerAccountId: peerId,
    receiverRatePerMinute:
      typeof receiverDoc.audioCallRate === 'number' && Number.isFinite(receiverDoc.audioCallRate)
        ? Math.max(0, receiverDoc.audioCallRate)
        : 0,
    callType: 'default',
    callId,
  });
};

export const startVoiceSession = async (
  req: Request<{}, {}, { callId?: string; peerId?: string }>,
  res: Response
): Promise<void> => {
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
    if (!mongoose.Types.ObjectId.isValid(peerId)) {
      res.status(400).json({ message: 'Valid peerId is required' });
      return;
    }

    const callerId = accountKind === 'user' ? meId : peerId;
    const receiverId = accountKind === 'receiver' ? meId : peerId;

    const receiver = await Receiver.findById(receiverId).select('audioCallRate');
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    const ratePerMinute =
      typeof receiver.audioCallRate === 'number' && Number.isFinite(receiver.audioCallRate)
        ? Math.max(0, receiver.audioCallRate)
        : 0;

    await CallSession.findOneAndUpdate(
      { callId },
      {
        $setOnInsert: {
          callId,
          callerId: new mongoose.Types.ObjectId(callerId),
          receiverId: new mongoose.Types.ObjectId(receiverId),
          startedAt: new Date(),
          status: 'ongoing',
          ratePerMinute,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('startVoiceSession error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const endVoiceSession = async (
  req: Request<{}, {}, { callId?: string }>,
  res: Response
): Promise<void> => {
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

    const current = await CallSession.findOne({ callId });
    if (!current) {
      res.status(404).json({ message: 'Call session not found' });
      return;
    }

    const isParticipant =
      String(current.callerId) === meId || String(current.receiverId) === meId;
    if (!isParticipant) {
      res.status(403).json({ message: 'Not allowed for this call' });
      return;
    }

    const dbSession = await mongoose.startSession();
    let finalDurationSec = current.durationSec;
    let settledAmountInr = roundInr(current.settledAmountInr || 0);
    try {
      await dbSession.withTransaction(async () => {
        const session = await CallSession.findOne({ callId }).session(dbSession);
        if (!session) throw new Error('Call session not found');

        if (session.status === 'completed') {
          finalDurationSec = session.durationSec;
          settledAmountInr = roundInr(session.settledAmountInr || 0);
          return;
        }

        const endedAt = new Date();
        const durationSec = Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000));
        const grossAmountInr = roundInr((durationSec / 60) * Math.max(0, session.ratePerMinute));

        const [callerDoc, receiverDoc] = await Promise.all([
          User.findById(session.callerId).select('walletBalance').session(dbSession),
          Receiver.findById(session.receiverId).select('walletBalance').session(dbSession),
        ]);
        if (!callerDoc || !receiverDoc) {
          throw new Error('Call participant account not found');
        }

        const callerBalance =
          typeof callerDoc.walletBalance === 'number' && Number.isFinite(callerDoc.walletBalance)
            ? Math.max(0, callerDoc.walletBalance)
            : 0;
        const transferAmount = roundInr(Math.min(grossAmountInr, callerBalance));

        if (transferAmount > 0) {
          callerDoc.walletBalance = roundInr(callerBalance - transferAmount);
          receiverDoc.walletBalance = roundInr(
            (typeof receiverDoc.walletBalance === 'number' && Number.isFinite(receiverDoc.walletBalance)
              ? receiverDoc.walletBalance
              : 0) + transferAmount
          );
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
    } finally {
      await dbSession.endSession();
    }

    res.status(200).json({
      ok: true,
      durationSec: finalDurationSec,
      estimatedEarning: settledAmountInr,
      settledAmountInr,
    });
    releaseReceiverReservation(String(current.receiverId));
    await syncReceiverQueueState(String(current.receiverId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('endVoiceSession error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const rateVoiceSession = async (
  req: Request<{}, {}, { callId?: string; rating?: number }>,
  res: Response
): Promise<void> => {
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

    const session = await CallSession.findOne({ callId, callerId: req.user._id });
    if (!session) {
      res.status(404).json({ message: 'Call session not found' });
      return;
    }

    session.callerRating = Math.round(rating);
    await session.save();
    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('rateVoiceSession error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
