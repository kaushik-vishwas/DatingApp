import CallSession from '../models/CallSession';
import ChatMessage from '../models/ChatMessage';
import AdminWithdrawalRequest from '../models/AdminWithdrawalRequest';
import { CHAT_TEXT_CHARGE_INR } from '../constants/chatPricing';

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfLocalWeek(d = new Date()): Date {
  const x = startOfLocalDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

export type AdminEarningsBreakdown = {
  callEarnings: number;
  messageEarnings: number;
  totalEarnings: number;
  calls: number;
  messages: number;
  callerCallGross: number;
  callerMessageGross: number;
  receiverCallPayout: number;
  receiverMessagePayout: number;
};

function finalizeBreakdown(parts: {
  callEarnings: number;
  messageEarnings: number;
  calls: number;
  messages: number;
  callerCallGross: number;
  callerMessageGross: number;
  receiverCallPayout: number;
  receiverMessagePayout: number;
}): AdminEarningsBreakdown {
  const callEarnings = roundInr(Math.max(0, parts.callEarnings));
  const messageEarnings = roundInr(Math.max(0, parts.messageEarnings));
  return {
    callEarnings,
    messageEarnings,
    totalEarnings: roundInr(Math.max(0, callEarnings + messageEarnings)),
    calls: parts.calls,
    messages: parts.messages,
    callerCallGross: roundInr(Math.max(0, parts.callerCallGross)),
    callerMessageGross: roundInr(Math.max(0, parts.callerMessageGross)),
    receiverCallPayout: roundInr(Math.max(0, parts.receiverCallPayout)),
    receiverMessagePayout: roundInr(Math.max(0, parts.receiverMessagePayout)),
  };
}

async function aggregateAdminEarnings(since?: Date | null): Promise<AdminEarningsBreakdown> {
  const callMatch: Record<string, unknown> = { status: 'completed' };
  if (since) callMatch.startedAt = { $gte: since };

  const [callAgg] = await CallSession.aggregate<{
    callerGross: number;
    receiverPayout: number;
    callEarnings: number;
    calls: number;
  }>([
    { $match: callMatch },
    {
      $addFields: {
        settled: { $ifNull: ['$settledAmountInr', 0] },
        resolvedReceiverPayout: {
          $cond: [
            { $gt: ['$receiverEarnedInr', 0] },
            '$receiverEarnedInr',
            {
              $multiply: [
                { $divide: [{ $ifNull: ['$durationSec', 0] }, 60] },
                { $ifNull: ['$receiverPayoutRatePerMinute', 0] },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        // Per-call margin only — legacy/test rows with receiver payout but no caller debit count as ₹0 admin margin.
        callMargin: {
          $max: [0, { $subtract: ['$settled', '$resolvedReceiverPayout'] }],
        },
      },
    },
    {
      $group: {
        _id: null,
        callerGross: { $sum: '$settled' },
        receiverPayout: { $sum: '$resolvedReceiverPayout' },
        callEarnings: { $sum: '$callMargin' },
        calls: { $sum: 1 },
      },
    },
  ]);

  const chatMatch: Record<string, unknown> = { senderType: 'u', feeInr: { $gt: 0 } };
  if (since) chatMatch.createdAt = { $gte: since };

  const [chatAgg] = await ChatMessage.aggregate<{
    callerMessageGross: number;
    receiverPayout: number;
    messageEarnings: number;
    messages: number;
  }>([
    { $match: chatMatch },
    {
      $addFields: {
        messageMargin: {
          $max: [0, { $subtract: [CHAT_TEXT_CHARGE_INR, { $ifNull: ['$feeInr', 0] }] }],
        },
      },
    },
    {
      $group: {
        _id: null,
        callerMessageGross: { $sum: CHAT_TEXT_CHARGE_INR },
        receiverPayout: { $sum: '$feeInr' },
        messageEarnings: { $sum: '$messageMargin' },
        messages: { $sum: 1 },
      },
    },
  ]);

  return finalizeBreakdown({
    callEarnings: callAgg?.callEarnings ?? 0,
    messageEarnings: chatAgg?.messageEarnings ?? 0,
    calls: callAgg?.calls ?? 0,
    messages: chatAgg?.messages ?? 0,
    callerCallGross: callAgg?.callerGross ?? 0,
    callerMessageGross: chatAgg?.callerMessageGross ?? 0,
    receiverCallPayout: callAgg?.receiverPayout ?? 0,
    receiverMessagePayout: chatAgg?.receiverPayout ?? 0,
  });
}

export async function computeReservedAdminEarningsInr(): Promise<number> {
  const [agg] = await AdminWithdrawalRequest.aggregate<{ total: number }>([
    { $match: { payoutStatus: { $in: ['processing', 'success'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return roundInr(agg?.total ?? 0);
}

export type PlatformRevenueSnapshot = {
  totalRevenue: number;
  adminEarnings: number;
  receiverRevenue: number;
  callerGross: number;
  breakdown: AdminEarningsBreakdown;
};

/** Caller-facing gross = admin margin + receiver share (always >= admin earnings alone). */
export async function getPlatformRevenueForRange(since?: Date | null): Promise<PlatformRevenueSnapshot> {
  const breakdown = await aggregateAdminEarnings(since);
  const adminEarnings = breakdown.totalEarnings;
  const receiverRevenue = roundInr(breakdown.receiverCallPayout + breakdown.receiverMessagePayout);
  const callerGross = roundInr(breakdown.callerCallGross + breakdown.callerMessageGross);
  const totalRevenue = roundInr(Math.max(callerGross, adminEarnings + receiverRevenue));
  return {
    totalRevenue,
    adminEarnings,
    receiverRevenue,
    callerGross,
    breakdown,
  };
}

export async function getAdminEarningsSnapshot(): Promise<{
  lifetime: AdminEarningsBreakdown;
  today: AdminEarningsBreakdown;
  thisWeek: AdminEarningsBreakdown;
  reservedInr: number;
  withdrawnInr: number;
  withdrawableInr: number;
}> {
  const todayStart = startOfLocalDay();
  const weekStart = startOfLocalWeek();

  const [lifetime, today, thisWeek, reservedInr] = await Promise.all([
    aggregateAdminEarnings(null),
    aggregateAdminEarnings(todayStart),
    aggregateAdminEarnings(weekStart),
    computeReservedAdminEarningsInr(),
  ]);

  const withdrawnInr = reservedInr;
  const withdrawableInr = roundInr(Math.max(0, lifetime.totalEarnings - reservedInr));

  return {
    lifetime,
    today,
    thisWeek,
    reservedInr,
    withdrawnInr,
    withdrawableInr,
  };
}
