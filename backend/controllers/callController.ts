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
    Receiver.findById(receiverId).select('accountStatus suspended audioCallRate'),
  ]);

  if (!callerDoc || callerDoc.accountStatus !== 'approved' || callerDoc.suspended) {
    res.status(403).json({ message: 'Caller account is not allowed for calling' });
    return;
  }
  if (!receiverDoc || receiverDoc.accountStatus !== 'approved' || receiverDoc.suspended) {
    res.status(403).json({ message: 'Receiver account is not allowed for calling' });
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

    const session = await CallSession.findOne({ callId });
    if (!session) {
      res.status(404).json({ message: 'Call session not found' });
      return;
    }

    const isParticipant =
      String(session.callerId) === meId || String(session.receiverId) === meId;
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
