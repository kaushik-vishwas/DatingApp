import CallSession from '../models/CallSession';
import ChatMessage from '../models/ChatMessage';
import AdminWithdrawalRequest from '../models/AdminWithdrawalRequest';
import WithdrawalRequest from '../models/WithdrawalRequest';
import WalletTopup from '../models/WalletTopup';
import Receiver from '../models/Receiver';
import mongoose from 'mongoose';
import { CHAT_TEXT_CHARGE_INR } from '../constants/chatPricing';
import { computeWalletRechargeBreakdown, payableMatchesWalletPack } from '../constants/walletRechargeFees';
import { RESOLVED_RECEIVER_CALL_EARNING_EXPR } from '../utils/receiverCallEarnings';
import { effectiveCallReceiverEarnedInr } from '../utils/receiverCallEarnings';

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

async function aggregateWithdrawalPlatformFees(since?: Date | null): Promise<number> {
  const match: Record<string, unknown> = { payoutStatus: 'success' };
  if (since) match.createdAt = { $gte: since };

  const [agg] = await WithdrawalRequest.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$platformFee', 0] } } } },
  ]);
  return roundInr(agg?.total ?? 0);
}

function finalizeBreakdown(parts: {
  callEarnings: number;
  messageEarnings: number;
  withdrawalFeeEarnings: number;
  calls: number;
  messages: number;
  callerCallGross: number;
  callerMessageGross: number;
  receiverCallPayout: number;
  receiverMessagePayout: number;
}): AdminEarningsBreakdown {
  const callEarnings = roundInr(Math.max(0, parts.callEarnings));
  const messageEarnings = roundInr(Math.max(0, parts.messageEarnings));
  const withdrawalFeeEarnings = roundInr(Math.max(0, parts.withdrawalFeeEarnings));
  return {
    callEarnings,
    messageEarnings,
    totalEarnings: roundInr(Math.max(0, callEarnings + messageEarnings + withdrawalFeeEarnings)),
    calls: parts.calls,
    messages: parts.messages,
    callerCallGross: roundInr(Math.max(0, parts.callerCallGross)),
    callerMessageGross: roundInr(Math.max(0, parts.callerMessageGross)),
    receiverCallPayout: roundInr(Math.max(0, parts.receiverCallPayout)),
    receiverMessagePayout: roundInr(Math.max(0, parts.receiverMessagePayout)),
  };
}

async function aggregateAdminEarnings(since?: Date | null): Promise<AdminEarningsBreakdown> {
  const callerSpendMatch: Record<string, unknown> = {
    status: 'completed',
    settledAmountInr: { $gt: 0 },
  };
  const payoutCallMatch: Record<string, unknown> = { status: 'completed', durationSec: { $gt: 0 } };
  if (since) {
    callerSpendMatch.startedAt = { $gte: since };
    payoutCallMatch.startedAt = { $gte: since };
  }

  const [callerSpendRows, callPayoutRows] = await Promise.all([
    CallSession.aggregate<{ callerGross: number; calls: number }>([
      { $match: callerSpendMatch },
      {
        $group: {
          _id: null,
          callerGross: { $sum: '$settledAmountInr' },
          calls: { $sum: 1 },
        },
      },
    ]),
    CallSession.aggregate<{
      receiverPayout: number;
      callEarnings: number;
      calls: number;
    }>([
      { $match: payoutCallMatch },
      {
        $addFields: {
          settled: { $ifNull: ['$settledAmountInr', 0] },
          resolvedReceiverPayout: RESOLVED_RECEIVER_CALL_EARNING_EXPR,
        },
      },
      {
        $addFields: {
          callMargin: {
            $max: [0, { $subtract: ['$settled', '$resolvedReceiverPayout'] }],
          },
        },
      },
      {
        $group: {
          _id: null,
          receiverPayout: { $sum: '$resolvedReceiverPayout' },
          callEarnings: { $sum: '$callMargin' },
          calls: { $sum: 1 },
        },
      },
    ]),
  ]);

  const callerSpendAgg = callerSpendRows[0];
  const callAgg = callPayoutRows[0];

  const chatMatch: Record<string, unknown> = { senderType: 'u', feeInr: { $gt: 0 } };
  if (since) chatMatch.createdAt = { $gte: since };

  const [chatAgg, withdrawalFeeEarnings] = await Promise.all([
    ChatMessage.aggregate<{
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
    ]).then((rows) => rows[0]),
    aggregateWithdrawalPlatformFees(since),
  ]);

  return finalizeBreakdown({
    callEarnings: callAgg?.callEarnings ?? 0,
    messageEarnings: chatAgg?.messageEarnings ?? 0,
    withdrawalFeeEarnings,
    calls: callerSpendAgg?.calls ?? callAgg?.calls ?? 0,
    messages: chatAgg?.messages ?? 0,
    callerCallGross: callerSpendAgg?.callerGross ?? 0,
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

/** Total revenue = actual caller wallet debits (call settlements + chat charges). */
export async function getPlatformRevenueForRange(since?: Date | null): Promise<PlatformRevenueSnapshot> {
  const breakdown = await aggregateAdminEarnings(since);
  const adminEarnings = breakdown.totalEarnings;
  const receiverRevenue = roundInr(breakdown.receiverCallPayout + breakdown.receiverMessagePayout);
  const callerGross = roundInr(breakdown.callerCallGross + breakdown.callerMessageGross);
  const totalRevenue = callerGross;
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

function localDateKey(d: Date): string {
  const x = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type DailyUsageAgg = { revenue: number; payout: number };

function bumpDailyUsage(
  map: Map<string, DailyUsageAgg>,
  date: Date,
  revenue: number,
  payout: number
): void {
  const key = localDateKey(date);
  const row = map.get(key) ?? { revenue: 0, payout: 0 };
  row.revenue = roundInr(row.revenue + revenue);
  row.payout = roundInr(row.payout + payout);
  map.set(key, row);
}

/** Platform fee applies only when the paid total includes the fee (post-fee recharge packs). */
function resolveWalletTopupPlatformFee(row: {
  payAmount: number;
  bonusPercent: number;
  creditAdded: number;
}): number {
  const credit = Number(row.creditAdded) || 0;
  const bonus = Number(row.bonusPercent) || 0;
  const payAmount = Number(row.payAmount) || 0;
  if (credit <= 0) return 0;

  const walletAmount = roundInr(credit / (1 + bonus / 100));
  if (walletAmount <= 0) return 0;

  if (payAmount > 0 && payableMatchesWalletPack(walletAmount, payAmount, 0.05)) {
    return computeWalletRechargeBreakdown(walletAmount).platformFee;
  }
  return 0;
}

async function aggregateCallerRechargePlatformFees(since?: Date | null): Promise<number> {
  const match: Record<string, unknown> = {};
  if (since) match.createdAt = { $gte: since };

  const rows = await WalletTopup.find(match)
    .select('payAmount bonusPercent creditAdded')
    .lean<{ payAmount: number; bonusPercent: number; creditAdded: number }[]>();
  let total = 0;
  for (const row of rows) {
    total += resolveWalletTopupPlatformFee(row);
  }
  return roundInr(total);
}

export type RevenueDashboardDailyRow = {
  date: string;
  revenue: number;
  commission: number;
  payout: number;
};

export type RevenueDashboardCards = {
  grossRevenue: number;
  platformCommission: number;
  netPayout: number;
  platformProfit: number;
  usageCommission: number;
  callerRechargeCommission: number;
  receiverWithdrawalCommission: number;
};

export type RevenueTopEarnerRow = {
  receiverId: string;
  name: string;
  calls: number;
  earnings: number;
  payout: number;
};

/** Admin revenue dashboard — actual caller spend, receiver payout, and platform fees. */
export async function getRevenueDashboardMetrics(since: Date | null): Promise<{
  cards: RevenueDashboardCards;
  dailyBreakdown: RevenueDashboardDailyRow[];
  topEarners: RevenueTopEarnerRow[];
}> {
  const callMatch: Record<string, unknown> = {
    status: 'completed',
    settledAmountInr: { $gt: 0 },
  };
  const chatMatch: Record<string, unknown> = { senderType: 'u', feeInr: { $gt: 0 } };
  if (since) {
    callMatch.startedAt = { $gte: since };
    chatMatch.createdAt = { $gte: since };
  }

  const [calls, chats, callerRechargeCommission, receiverWithdrawalCommission] = await Promise.all([
    CallSession.find(callMatch)
      .select(
        'receiverId startedAt settledAmountInr receiverEarnedInr receiverPayoutRatePerMinute durationSec'
      )
      .lean<
        {
          receiverId: mongoose.Types.ObjectId;
          startedAt: Date;
          settledAmountInr?: number;
          receiverEarnedInr?: number;
          receiverPayoutRatePerMinute?: number;
          durationSec?: number;
        }[]
      >(),
    ChatMessage.find(chatMatch)
      .select('receiverId createdAt feeInr')
      .lean<{ receiverId: mongoose.Types.ObjectId; createdAt: Date; feeInr: number }[]>(),
    aggregateCallerRechargePlatformFees(since),
    aggregateWithdrawalPlatformFees(since),
  ]);

  const dailyMap = new Map<string, DailyUsageAgg>();
  const receiverGross = new Map<string, { gross: number; payout: number; calls: number }>();

  let grossCalls = 0;
  let grossChat = 0;
  let payoutCalls = 0;
  let payoutChat = 0;

  for (const row of calls) {
    const revenue = roundInr(Number(row.settledAmountInr || 0));
    const payout = effectiveCallReceiverEarnedInr(row);
    grossCalls += revenue;
    payoutCalls += payout;
    bumpDailyUsage(dailyMap, row.startedAt, revenue, payout);

    const rid = String(row.receiverId);
    const agg = receiverGross.get(rid) ?? { gross: 0, payout: 0, calls: 0 };
    agg.gross = roundInr(agg.gross + revenue);
    agg.payout = roundInr(agg.payout + payout);
    agg.calls += 1;
    receiverGross.set(rid, agg);
  }

  for (const row of chats) {
    const revenue = roundInr(CHAT_TEXT_CHARGE_INR);
    const payout = roundInr(Number(row.feeInr || 0));
    grossChat += revenue;
    payoutChat += payout;
    bumpDailyUsage(dailyMap, row.createdAt, revenue, payout);

    const rid = String(row.receiverId);
    const agg = receiverGross.get(rid) ?? { gross: 0, payout: 0, calls: 0 };
    agg.gross = roundInr(agg.gross + revenue);
    agg.payout = roundInr(agg.payout + payout);
    receiverGross.set(rid, agg);
  }

  const grossRevenue = roundInr(grossCalls + grossChat);
  const netPayout = roundInr(payoutCalls + payoutChat);
  const usageCommission = roundInr(Math.max(0, grossRevenue - netPayout));
  const platformCommission = roundInr(callerRechargeCommission + receiverWithdrawalCommission);
  const platformProfit = usageCommission;

  const dailyBreakdown: RevenueDashboardDailyRow[] = [...dailyMap.entries()]
    .sort((a, b) => (a[0] > b[0] ? -1 : 1))
    .slice(0, since ? undefined : 90)
    .map(([date, row]) => ({
      date,
      revenue: row.revenue,
      payout: row.payout,
      commission: roundInr(Math.max(0, row.revenue - row.payout)),
    }));

  const topReceiverIds = [...receiverGross.entries()]
    .sort((a, b) => b[1].payout - a[1].payout)
    .slice(0, 10)
    .map(([rid]) => new mongoose.Types.ObjectId(rid));
  const receiverRows =
    topReceiverIds.length > 0
      ? await Receiver.find({ _id: { $in: topReceiverIds } })
          .select('_id name')
          .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>()
      : [];
  const receiverNameById = new Map(receiverRows.map((r) => [String(r._id), r.name]));

  const topEarners: RevenueTopEarnerRow[] = [...receiverGross.entries()]
    .sort((a, b) => b[1].payout - a[1].payout)
    .slice(0, 5)
    .map(([rid, v]) => ({
      receiverId: rid,
      name: receiverNameById.get(rid) ?? 'Receiver',
      calls: v.calls,
      earnings: roundInr(v.gross),
      payout: roundInr(v.payout),
    }));

  return {
    cards: {
      grossRevenue,
      platformCommission,
      netPayout,
      platformProfit,
      usageCommission,
      callerRechargeCommission,
      receiverWithdrawalCommission,
    },
    dailyBreakdown,
    topEarners,
  };
}
