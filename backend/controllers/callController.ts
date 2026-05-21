import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import ChatBlock from '../models/ChatBlock';
import User from '../models/User';
import Receiver, { RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN } from '../models/Receiver';
import CallSession, { type CallSessionDocument } from '../models/CallSession';
import ReceiverRating from '../models/ReceiverRating';
import UserReport from '../models/UserReport';
import {
  buildVoiceCallId,
  createStreamUserToken,
  getStreamApiKey,
  toStreamUserId,
} from '../utils/streamVoice';
import { recordReceiverCallScore } from '../services/receiverScore';
import { pickRandomQueuedReceiverForCaller } from '../services/callQueue';
import {
  releaseReceiverReservation,
  syncReceiverQueueState,
} from '../services/callQueue';

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type SettledCallSnapshot = {
  durationSec: number;
  settledAmountInr: number;
  receiverEarnedInr: number;
  status: 'ongoing' | 'completed';
  receiverId: string;
  callerId: string;
  startedAt: Date;
  justCompleted: boolean;
};

/** Completed calls shorter than this count as missed/incomplete for receiver history. */
export const MISSED_OR_INCOMPLETE_MAX_SEC = 55;

type CallTalkTimingFields = {
  talkStartedAt?: Date | null;
  callerJoinedAt?: Date | null;
  receiverJoinedAt?: Date | null;
  startedAt: Date;
};

/** Anchor for live/ settled talk duration (both sides connected). */
export function callTalkStartedAt(call: CallTalkTimingFields): Date | null {
  if (call.talkStartedAt) return call.talkStartedAt;
  if (call.callerJoinedAt && call.receiverJoinedAt) {
    return new Date(Math.max(call.callerJoinedAt.getTime(), call.receiverJoinedAt.getTime()));
  }
  // Legacy rows before per-party join tracking.
  if (!call.callerJoinedAt && !call.receiverJoinedAt) {
    return call.startedAt;
  }
  return null;
}

export function callTalkDurationSec(call: CallTalkTimingFields, now: Date = new Date()): number {
  const anchor = callTalkStartedAt(call);
  if (!anchor) return 0;
  return Math.max(0, Math.round((now.getTime() - anchor.getTime()) / 1000));
}

async function recordVoiceParticipantJoined(
  callId: string,
  accountKind: 'user' | 'receiver'
): Promise<CallSessionDocument> {
  const now = new Date();
  const joinField = accountKind === 'user' ? 'callerJoinedAt' : 'receiverJoinedAt';

  let session = await CallSession.findOneAndUpdate(
    { callId, [joinField]: null },
    { $set: { [joinField]: now } },
    { new: true }
  );

  if (!session) {
    session = await CallSession.findOne({ callId });
  }

  if (!session) {
    throw new Error('Call session not found');
  }

  if (session.callerJoinedAt && session.receiverJoinedAt && !session.talkStartedAt) {
    const talkStartedAt = new Date(
      Math.max(session.callerJoinedAt.getTime(), session.receiverJoinedAt.getTime())
    );
    session = await CallSession.findOneAndUpdate(
      { callId },
      { $set: { talkStartedAt } },
      { new: true }
    );
    if (!session) {
      throw new Error('Call session not found');
    }
  }

  return session;
}

function callTalkApiFields(session: CallSessionDocument): {
  talkStartedAt: string | null;
  talkActive: boolean;
} {
  const anchor = callTalkStartedAt(session);
  return {
    talkStartedAt: anchor ? anchor.toISOString() : null,
    talkActive: anchor != null,
  };
}

/**
 * End a call for history/billing. If no voice session was started (ring-only hang-up),
 * records a zero-duration completed session so receiver missed-call insights work.
 */
export async function ensureCallEndedAndSettled(
  callId: string,
  opts: { callerId: string; receiverId: string; startedAt?: Date }
): Promise<SettledCallSnapshot> {
  const existing = await CallSession.findOne({ callId });
  if (!existing) {
    const receiver = await Receiver.findById(opts.receiverId).select('earningRatePerMinute');
    if (!receiver) throw new Error('Receiver not found');

    const receiverPayoutRatePerMinute =
      typeof receiver.earningRatePerMinute === 'number' && Number.isFinite(receiver.earningRatePerMinute)
        ? Math.max(0, receiver.earningRatePerMinute)
        : 0;

    const now = new Date();
    const startedAt = opts.startedAt ?? now;
    await CallSession.create({
      callId,
      callerId: new mongoose.Types.ObjectId(opts.callerId),
      receiverId: new mongoose.Types.ObjectId(opts.receiverId),
      startedAt,
      endedAt: now,
      durationSec: 0,
      status: 'completed',
      ratePerMinute: RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
      receiverPayoutRatePerMinute,
      settledAmountInr: 0,
      receiverEarnedInr: 0,
    });

    return {
      durationSec: 0,
      settledAmountInr: 0,
      receiverEarnedInr: 0,
      status: 'completed',
      receiverId: opts.receiverId,
      callerId: opts.callerId,
      startedAt,
      justCompleted: true,
    };
  }

  if (existing.status === 'ongoing') {
    return settleCallSession(callId, true);
  }

  return {
    durationSec: existing.durationSec,
    settledAmountInr: roundInr(existing.settledAmountInr || 0),
    receiverEarnedInr: roundInr(existing.receiverEarnedInr || 0),
    status: 'completed',
    receiverId: String(existing.receiverId),
    callerId: String(existing.callerId),
    startedAt: existing.startedAt,
    justCompleted: false,
  };
}

export async function settleCallSession(
  callId: string,
  complete: boolean
): Promise<SettledCallSnapshot> {
  const dbSession = await mongoose.startSession();
  let snapshot: SettledCallSnapshot | null = null;
  try {
    await dbSession.withTransaction(async () => {
      const call = await CallSession.findOne({ callId }).session(dbSession);
      if (!call) throw new Error('Call session not found');

      if (call.status === 'completed') {
        snapshot = {
          durationSec: call.durationSec,
          settledAmountInr: roundInr(call.settledAmountInr || 0),
          receiverEarnedInr: roundInr(call.receiverEarnedInr || 0),
          status: 'completed',
          receiverId: String(call.receiverId),
          callerId: String(call.callerId),
          startedAt: call.startedAt,
          justCompleted: false,
        };
        return;
      }

      const now = new Date();
      const durationSec = callTalkDurationSec(call, now);
      const grossAmountInr = roundInr((durationSec / 60) * Math.max(0, call.ratePerMinute));
      const alreadySettled = roundInr(call.settledAmountInr || 0);
      const dueAmount = roundInr(Math.max(0, grossAmountInr - alreadySettled));
      const receiverEarnedInr = roundInr(
        (durationSec / 60) * Math.max(0, Number(call.receiverPayoutRatePerMinute || 0))
      );

      let settledNow = 0;
      if (dueAmount > 0) {
        const [callerDoc, receiverDoc] = await Promise.all([
          User.findById(call.callerId).select('walletBalance').session(dbSession),
          Receiver.findById(call.receiverId).select('_id').session(dbSession),
        ]);
        if (!callerDoc || !receiverDoc) {
          throw new Error('Call participant account not found');
        }

        const callerBalance =
          typeof callerDoc.walletBalance === 'number' && Number.isFinite(callerDoc.walletBalance)
            ? Math.max(0, callerDoc.walletBalance)
            : 0;
        settledNow = roundInr(Math.min(dueAmount, callerBalance));
        if (settledNow > 0) {
          callerDoc.walletBalance = roundInr(callerBalance - settledNow);
          await callerDoc.save({ session: dbSession });
        }
      }

      const nextSettled = roundInr(alreadySettled + settledNow);
      call.durationSec = durationSec;
      call.settledAmountInr = nextSettled;
      call.receiverEarnedInr = receiverEarnedInr;
      if (complete) {
        call.status = 'completed';
        call.endedAt = now;
      }
      await call.save({ session: dbSession });

      snapshot = {
        durationSec,
        settledAmountInr: nextSettled,
        receiverEarnedInr,
        status: complete ? 'completed' : 'ongoing',
        receiverId: String(call.receiverId),
        callerId: String(call.callerId),
        startedAt: call.startedAt,
        justCompleted: complete,
      };
    });
  } finally {
    await dbSession.endSession();
  }
  if (!snapshot) {
    throw new Error('Call settlement failed');
  }
  return snapshot;
}

/** Live calls hit sessionSync every ~5s, which bumps updatedAt. No updates for this long ⇒ abandoned. */
const DEFAULT_STALE_ONGOING_MS = 90 * 1000;

/**
 * Ongoing CallSession rows persist in MongoDB; orphan "ongoing" blocks bootstrap forever.
 * - Same caller+receiver as the DB row → allow (reconnect / second bootstrap for same call).
 * - Different caller → if session is stale (no updatedAt activity), settle and clear; else busy.
 */
async function receiverHasBlockingOngoingSession(receiverId: string, callerUserId: string): Promise<boolean> {
  const oid = new mongoose.Types.ObjectId(receiverId);
  const staleMs = Number(process.env.STALE_ONGOING_CALL_MS ?? DEFAULT_STALE_ONGOING_MS);
  if (!Number.isFinite(staleMs) || staleMs < 60_000) {
    const doc = await CallSession.exists({ receiverId: oid, status: 'ongoing' });
    return doc != null;
  }

  const session = await CallSession.findOne({ receiverId: oid, status: 'ongoing' })
    .select('callerId callId updatedAt startedAt')
    .lean<{
      callerId: mongoose.Types.ObjectId;
      callId: string;
      updatedAt?: Date;
      startedAt?: Date;
    } | null>();

  if (!session) return false;

  if (String(session.callerId) === callerUserId) {
    return false;
  }

  const touch =
    (session.updatedAt && session.updatedAt.getTime()) ||
    (session.startedAt && session.startedAt.getTime()) ||
    0;
  if (Date.now() - touch <= staleMs) {
    return true;
  }

  try {
    const settled = await settleCallSession(session.callId, true);
    if (settled.justCompleted) {
      void recordReceiverCallScore({
        callId: session.callId,
        receiverId: settled.receiverId,
        callerId: settled.callerId,
        startedAt: settled.startedAt,
        durationSec: settled.durationSec,
      }).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('receiver call score record (stale settle):', msg);
      });
    }
    releaseReceiverReservation(settled.receiverId);
    await syncReceiverQueueState(settled.receiverId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('receiverHasBlockingOngoingSession stale settle:', msg);
  }

  const doc = await CallSession.exists({ receiverId: oid, status: 'ongoing' });
  return doc != null;
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
  const requestedCallId = typeof req.query.callId === 'string' ? req.query.callId.trim() : '';
  if (!accountKind || !meId) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(peerId)) {
    res.status(400).json({ message: 'Valid peerId is required' });
    return;
  }
  if (requestedCallId && requestedCallId.length > 200) {
    res.status(400).json({ message: 'Invalid callId' });
    return;
  }

  const callerUserId = accountKind === 'user' ? meId : peerId;
  const receiverId = accountKind === 'receiver' ? meId : peerId;

  const [callerDoc, receiverDoc] = await Promise.all([
    User.findById(callerUserId).select('accountStatus suspended'),
    Receiver.findById(receiverId).select(
      'accountStatus suspended audioCallRate isAvailable isOnline earningRatePerMinute'
    ),
  ]);

  if (!callerDoc || callerDoc.accountStatus !== 'approved' || callerDoc.suspended) {
    res.status(403).json({ message: 'Caller account is not allowed for calling' });
    return;
  }
  if (!receiverDoc || receiverDoc.accountStatus !== 'approved' || receiverDoc.suspended) {
    res.status(403).json({ message: 'Receiver account is not allowed for calling' });
    return;
  }
  const blocking = await receiverHasBlockingOngoingSession(receiverId, callerUserId);
  if (blocking) {
    res.status(409).json({ message: 'Receiver is busy on another call' });
    return;
  }
  if (!receiverDoc.isAvailable) {
    res.status(409).json({ message: 'Receiver is currently unavailable' });
    return;
  }
  if (await ChatBlock.exists({ userId: callerUserId, receiverId })) {
    res.status(403).json({ message: 'This pair is blocked for communication' });
    return;
  }

  const meStreamUserId = toStreamUserId(accountKind, meId);
  const peerStreamUserId = toStreamUserId(accountKind === 'user' ? 'receiver' : 'user', peerId);
  const { token, expiresAt } = createStreamUserToken(meStreamUserId);
  const callId = requestedCallId || buildVoiceCallId(meStreamUserId, peerStreamUserId);

  res.json({
    apiKey: getStreamApiKey(),
    token,
    tokenExpiresAt: expiresAt,
    streamUserId: meStreamUserId,
    peerStreamUserId,
    peerAccountId: peerId,
    receiverRatePerMinute: RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
    receiverEarningRatePerMinute:
      typeof receiverDoc.earningRatePerMinute === 'number' && Number.isFinite(receiverDoc.earningRatePerMinute)
        ? roundInr(receiverDoc.earningRatePerMinute)
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

    const receiver = await Receiver.findById(receiverId).select('audioCallRate earningRatePerMinute');
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    const ratePerMinute = RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN;
    const receiverPayoutRatePerMinute =
      typeof receiver.earningRatePerMinute === 'number' && Number.isFinite(receiver.earningRatePerMinute)
        ? Math.max(0, receiver.earningRatePerMinute)
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
          receiverPayoutRatePerMinute,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const session = await recordVoiceParticipantJoined(callId, accountKind);

    res.status(200).json({ ok: true, ...callTalkApiFields(session) });
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

    const settled = await settleCallSession(callId, true);
    if (settled.justCompleted) {
      void recordReceiverCallScore({
        callId,
        receiverId: settled.receiverId,
        callerId: settled.callerId,
        startedAt: settled.startedAt,
        durationSec: settled.durationSec,
      }).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('receiver call score record error:', msg);
      });
    }

    let callerWalletBalanceInr: number | undefined;
    if (accountKind === 'user') {
      const callerDoc = await User.findById(meId).select('walletBalance').lean();
      callerWalletBalanceInr =
        typeof callerDoc?.walletBalance === 'number' && Number.isFinite(callerDoc.walletBalance)
          ? roundInr(Math.max(0, callerDoc.walletBalance))
          : 0;
    }

    const endedSession = await CallSession.findOne({ callId }).lean();
    const talkFields = endedSession ? callTalkApiFields(endedSession as CallSessionDocument) : {
      talkStartedAt: null,
      talkActive: false,
    };

    res.status(200).json({
      ok: true,
      durationSec: settled.durationSec,
      estimatedEarning: settled.receiverEarnedInr,
      settledAmountInr: settled.settledAmountInr,
      receiverEarnedInr: settled.receiverEarnedInr,
      canRate: settled.durationSec >= 30,
      ...talkFields,
      ...(callerWalletBalanceInr !== undefined ? { callerWalletBalanceInr } : {}),
    });
    releaseReceiverReservation(settled.receiverId);
    await syncReceiverQueueState(settled.receiverId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('endVoiceSession error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const syncVoiceSession = async (
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

    const settled = await settleCallSession(callId, false);
    const latest = await CallSession.findOne({ callId });
    const talkFields = callTalkApiFields((latest ?? current) as CallSessionDocument);
    res.status(200).json({
      ok: true,
      durationSec: settled.durationSec,
      settledAmountInr: settled.settledAmountInr,
      receiverEarnedInr: settled.receiverEarnedInr,
      canRate: settled.durationSec >= 30,
      status: settled.status,
      ...talkFields,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('syncVoiceSession error:', msg);
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
    if (session.status !== 'completed') {
      res.status(409).json({ message: 'You can rate only after a completed call.' });
      return;
    }
    if (session.durationSec < 30) {
      res.status(409).json({ message: 'Call too short for rating. Minimum 30 seconds required.' });
      return;
    }
    if (typeof session.callerRating === 'number') {
      res.status(409).json({ message: 'This call has already been rated.' });
      return;
    }

    const rounded = Math.round(rating);
    session.callerRating = rounded;
    await session.save();
    await ReceiverRating.findOneAndUpdate(
      {
        receiverId: session.receiverId,
        raterId: session.callerId,
      },
      {
        $set: {
          rating: rounded,
          lastCallId: session.callId,
        },
      },
      { upsert: true, new: true }
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('rateVoiceSession error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/** Labels must match caller app post-call issue chips. */
const VOICE_CALL_ISSUE_TAGS = [
  'Background noise',
  'Not Talking',
  'Asked me to end Call',
  'Wrong Gender',
  'Call Disconnected',
] as const;

const voiceIssueTagSet = new Set<string>(VOICE_CALL_ISSUE_TAGS);

/**
 * POST /calls/session/report — caller reports issues after a completed voice call (admin moderation queue).
 */
export const reportVoiceSessionIssue = async (
  req: Request<{}, {}, { callId?: string; tags?: unknown }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'user' || !req.user?._id) {
      res.status(403).json({ message: 'Only callers can submit call reports' });
      return;
    }
    const callId = String(req.body.callId ?? '').trim();
    const tagsRaw = req.body.tags;
    const tags = Array.isArray(tagsRaw)
      ? [...new Set(tagsRaw.map((t) => String(t).trim()).filter(Boolean))]
      : [];
    if (!callId) {
      res.status(400).json({ message: 'callId is required' });
      return;
    }
    if (!tags.length) {
      res.status(400).json({ message: 'Select at least one issue' });
      return;
    }
    const unknown = tags.filter((t) => !voiceIssueTagSet.has(t));
    if (unknown.length) {
      res.status(400).json({ message: 'Invalid issue tag(s)' });
      return;
    }

    const session = await CallSession.findOne({ callId, callerId: req.user._id });
    if (!session) {
      res.status(404).json({ message: 'Call session not found' });
      return;
    }
    if (session.status !== 'completed') {
      res.status(409).json({ message: 'You can report only after the call has ended.' });
      return;
    }

    const cost = roundInr(session.settledAmountInr || 0);
    const preview = [`Issues: ${tags.join(', ')}`, `Call: ${callId}`, `${session.durationSec}s`, `₹${cost}`]
      .join(' · ')
      .slice(0, 500);

    await UserReport.create({
      reporterKind: 'user',
      reporterId: req.user._id,
      reportedKind: 'receiver',
      reportedId: session.receiverId,
      reason: 'Call session issue',
      preview,
      status: 'pending',
      resolution: null,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('reportVoiceSessionIssue error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
