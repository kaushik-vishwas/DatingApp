import mongoose from 'mongoose';
import CallSession from '../models/CallSession';
import Receiver from '../models/Receiver';
import ReceiverDailyScore from '../models/ReceiverDailyScore';

const MAX_SCORED_CALLS_PER_CALLER_PER_DAY = 3;
const MIN_VALID_CALL_SECONDS = 55;
const MIN_MID_BAND_SECONDS = 3 * 60;
const MIN_TOP_BAND_SECONDS = 10 * 60;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayStartUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function badgeForScore(score: number): { badgeLevel: 'platinum' | 'diamond' | 'supreme'; ratePerMinute: number } {
  if (score > 12000) return { badgeLevel: 'supreme', ratePerMinute: 2.6 };
  if (score > 8000) return { badgeLevel: 'diamond', ratePerMinute: 2.3 };
  return { badgeLevel: 'platinum', ratePerMinute: 2.0 };
}

function callScoreForDuration(durationSec: number): number {
  const minutes = durationSec / 60;
  if (durationSec > MIN_TOP_BAND_SECONDS) return round2(minutes * 5);
  if (durationSec >= MIN_MID_BAND_SECONDS) return round2(minutes * 3);
  return 0;
}

export async function recordReceiverCallScore(args: {
  callId: string;
  receiverId: string;
  callerId: string;
  startedAt: Date;
  durationSec: number;
}): Promise<void> {
  const { callId, receiverId, callerId, startedAt, durationSec } = args;
  const dateKey = utcDateKey(startedAt);

  if (durationSec < MIN_VALID_CALL_SECONDS) {
    await ReceiverDailyScore.findOneAndUpdate(
      { receiverId: new mongoose.Types.ObjectId(receiverId), dateKey },
      { $inc: { shortCallsIgnored: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return;
  }

  const dayStart = dayStartUtc(dateKey);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const sameCallerCount = await CallSession.countDocuments({
    callId: { $ne: callId },
    receiverId: new mongoose.Types.ObjectId(receiverId),
    callerId: new mongoose.Types.ObjectId(callerId),
    status: 'completed',
    durationSec: { $gte: MIN_VALID_CALL_SECONDS },
    startedAt: { $gte: dayStart, $lt: dayEnd },
  });
  if (sameCallerCount >= MAX_SCORED_CALLS_PER_CALLER_PER_DAY) {
    await ReceiverDailyScore.findOneAndUpdate(
      { receiverId: new mongoose.Types.ObjectId(receiverId), dateKey },
      { $inc: { spamCallsIgnored: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return;
  }

  const validCallMinutes = round2(durationSec / 60);
  const score = callScoreForDuration(durationSec);

  await ReceiverDailyScore.findOneAndUpdate(
    { receiverId: new mongoose.Types.ObjectId(receiverId), dateKey },
    {
      $inc: {
        callScore: score,
        totalScore: score,
        validCallMinutes,
        validCalls: 1,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const receiver = await Receiver.findById(receiverId).select('cumulativeScore cumulativeValidCallMinutes');
  if (!receiver) return;
  receiver.cumulativeScore = round2((receiver.cumulativeScore || 0) + score);
  receiver.cumulativeValidCallMinutes = round2((receiver.cumulativeValidCallMinutes || 0) + validCallMinutes);
  const badge = badgeForScore(receiver.cumulativeScore);
  receiver.badgeLevel = badge.badgeLevel;
  receiver.earningRatePerMinute = badge.ratePerMinute;
  await receiver.save();
}

type OnlineWindowBuckets = {
  dayMinutes: number;
  nightMinutes: number;
  lateNightMinutes: number;
};

function splitOnlineMinutes(start: Date, end: Date): OnlineWindowBuckets {
  if (end <= start) return { dayMinutes: 0, nightMinutes: 0, lateNightMinutes: 0 };
  let dayMinutes = 0;
  let nightMinutes = 0;
  let lateNightMinutes = 0;
  const cursor = new Date(start.getTime());
  while (cursor < end) {
    const nextMinute = new Date(cursor.getTime() + 60 * 1000);
    const h = cursor.getUTCHours();
    if (h >= 9 && h < 21) dayMinutes += 1;
    else if (h >= 22) nightMinutes += 1;
    else if (h >= 0 && h < 2) lateNightMinutes += 1;
    cursor.setTime(nextMinute.getTime());
  }
  return { dayMinutes, nightMinutes, lateNightMinutes };
}

export async function finalizeReceiverOnlineSession(args: {
  receiverId: string;
  onlineSince: Date;
  endedAt: Date;
}): Promise<void> {
  const { receiverId, onlineSince, endedAt } = args;
  if (endedAt <= onlineSince) return;
  const dateKey = utcDateKey(onlineSince);
  const { dayMinutes, nightMinutes, lateNightMinutes } = splitOnlineMinutes(onlineSince, endedAt);
  const onlineScore = round2(dayMinutes * 0.5 + nightMinutes * 3 + lateNightMinutes * 10);

  await ReceiverDailyScore.findOneAndUpdate(
    { receiverId: new mongoose.Types.ObjectId(receiverId), dateKey },
    {
      $inc: {
        dayOnlineMinutes: dayMinutes,
        nightOnlineMinutes: nightMinutes,
        lateNightOnlineMinutes: lateNightMinutes,
        onlineScore,
        totalScore: onlineScore,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const receiver = await Receiver.findById(receiverId).select('cumulativeScore');
  if (!receiver) return;
  receiver.cumulativeScore = round2((receiver.cumulativeScore || 0) + onlineScore);
  const badge = badgeForScore(receiver.cumulativeScore);
  receiver.badgeLevel = badge.badgeLevel;
  receiver.earningRatePerMinute = badge.ratePerMinute;
  await receiver.save();
}

