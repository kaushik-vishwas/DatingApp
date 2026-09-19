import CallSession from '../models/CallSession';
import ChatMessage from '../models/ChatMessage';
import AdminWithdrawalRequest from '../models/AdminWithdrawalRequest';
import WithdrawalRequest from '../models/WithdrawalRequest';
import WalletTopup from '../models/WalletTopup';
import Receiver from '../models/Receiver';
import Referral from '../models/Referral';
import mongoose from 'mongoose';
import { CHAT_TEXT_CHARGE_INR } from '../constants/chatPricing';
import { computeWalletRechargeBreakdown, payableMatchesWalletPack } from '../constants/walletRechargeFees';
import { paidWithdrawalMatch, resolveWithdrawalPayoutAmount } from '../constants/receiverWithdrawalFees';
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
  totalRevenue: number;
  totalPayout: number;
  calls: number;
  messages: number;
  callerCallGross: number;
  callerMessageGross: number;
  receiverCallPayout: number;
  receiverMessagePayout: number;
  withdrawalFeeEarnings: number;
  referralRewardsPaid: number;
};

/** Net amount actually paid to receivers — only payoutStatus success (not pending / failed / processing). */
export async function aggregateReceiverWithdrawalPayouts(
  since?: Date | null,
  extraMatch: Record<string, unknown> = {}
): Promise<number> {
  const rows = await WithdrawalRequest.find({ ...paidWithdrawalMatch(since), ...extraMatch })
    .select('amount payoutAmount')
    .lean<{ amount: number; payoutAmount?: number | null }[]>();
  let total = 0;
  for (const row of rows) {
    total += resolveWithdrawalPayoutAmount(row);
  }
  return roundInr(total);
}

/** Count of withdrawals actually paid out. */
export async function countPaidReceiverWithdrawals(
  since?: Date | null,
  extraMatch: Record<string, unknown> = {}
): Promise<number> {
  return WithdrawalRequest.countDocuments({ ...paidWithdrawalMatch(since), ...extraMatch });
}

/** Admin total earned = caller revenue − receiver withdrawals paid + withdrawal fees − referral rewards. */
export function computeAdminTotalEarned(
  totalRevenue: number,
  receiverWithdrawalPayout: number,
  withdrawalFeeEarnings: number,
  referralRewardsPaid: number
): number {
  return roundInr(
    Math.max(
      0,
      totalRevenue - receiverWithdrawalPayout + withdrawalFeeEarnings - referralRewardsPaid
    )
  );
}

async function aggregateWithdrawalPlatformFees(since?: Date | null): Promise<number> {
  const match = paidWithdrawalMatch(since);

  const [agg] = await WithdrawalRequest.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$platformFee', 0] } } } },
  ]);
  return roundInr(agg?.total ?? 0);
}

/** Refer-and-earn payouts are funded from platform admin earnings only. */
export async function aggregateReferralRewardsPaid(since?: Date | null): Promise<number> {
  const match: Record<string, unknown> = { status: 'rewarded' };
  if (since) match.rewardedAt = { $gte: since };

  const [agg] = await Referral.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$rewardInr' } } },
  ]);
  return roundInr(agg?.total ?? 0);
}

function finalizeBreakdown(parts: {
  callEarnings: number;
  messageEarnings: number;
  withdrawalFeeEarnings: number;
  referralRewardsPaid: number;
  calls: number;
  messages: number;
  callerCallGross: number;
  callerMessageGross: number;
  receiverCallPayout: number;
  receiverMessagePayout: number;
}): AdminEarningsBreakdown {
  const callerCallGross = roundInr(Math.max(0, parts.callerCallGross));
  const callerMessageGross = roundInr(Math.max(0, parts.callerMessageGross));
  const receiverCallPayout = roundInr(Math.max(0, parts.receiverCallPayout));
  const receiverMessagePayout = roundInr(Math.max(0, parts.receiverMessagePayout));
  const totalRevenue = roundInr(callerCallGross + callerMessageGross);
  const totalPayout = roundInr(receiverCallPayout + receiverMessagePayout);
  const callEarnings = roundInr(Math.max(0, callerCallGross - receiverCallPayout));
  const messageEarnings = roundInr(Math.max(0, callerMessageGross - receiverMessagePayout));
  const withdrawalFeeEarnings = roundInr(Math.max(0, parts.withdrawalFeeEarnings));
  const referralRewardsPaid = roundInr(Math.max(0, parts.referralRewardsPaid));
  return {
    callEarnings,
    messageEarnings,
    totalRevenue,
    totalPayout,
    /** Admin usage margin: caller spend − receiver payout. Changes with payout rates. */
    totalEarnings: roundInr(Math.max(0, totalRevenue - totalPayout)),
    calls: parts.calls,
    messages: parts.messages,
    callerCallGross,
    callerMessageGross,
    receiverCallPayout,
    receiverMessagePayout,
    withdrawalFeeEarnings,
    referralRewardsPaid,
  };
}

async function aggregateAdminEarnings(since?: Date | null): Promise<AdminEarningsBreakdown> {
  const callMatch: Record<string, unknown> = { status: 'completed' };
  if (since) callMatch.startedAt = { $gte: since };

  const [callAgg] = await CallSession.aggregate<{
    callerGross: number;
    receiverPayout: number;
    calls: number;
  }>([
    { $match: callMatch },
    {
      $addFields: {
        settled: { $ifNull: ['$settledAmountInr', 0] },
        resolvedReceiverPayout: RESOLVED_RECEIVER_CALL_EARNING_EXPR,
      },
    },
    {
      $group: {
        _id: null,
        callerGross: { $sum: '$settled' },
        receiverPayout: { $sum: '$resolvedReceiverPayout' },
        calls: {
          $sum: {
            $cond: [
              {
                $or: [{ $gt: ['$settled', 0] }, { $gt: [{ $ifNull: ['$durationSec', 0] }, 0] }],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const chatMatch: Record<string, unknown> = { senderType: 'u', feeInr: { $gt: 0 } };
  if (since) chatMatch.createdAt = { $gte: since };

  const [chatAgg, withdrawalFeeEarnings, referralRewardsPaid] = await Promise.all([
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
    aggregateReferralRewardsPaid(since),
  ]);

  return finalizeBreakdown({
    callEarnings: 0,
    messageEarnings: chatAgg?.messageEarnings ?? 0,
    withdrawalFeeEarnings,
    referralRewardsPaid,
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
  /** Caller wallet recharges collected (Razorpay top-ups saved in DB). */
  totalRevenue: number;
  walletCollections: number;
  /** Caller spend on calls + chat (internal usage). */
  callerUsageSpend: number;
  adminEarnings: number;
  receiverRevenue: number;
  callerGross: number;
  breakdown: AdminEarningsBreakdown;
};

/** Sum of successful wallet recharges (`WalletTopup.payAmount`) — matches Transactions / Razorpay collections. */
export async function aggregateWalletTopupCollections(since?: Date | null): Promise<number> {
  const match: Record<string, unknown> = {};
  if (since) match.createdAt = { $gte: since };

  const [agg] = await WalletTopup.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$payAmount', 0] } } } },
  ]);
  return roundInr(agg?.total ?? 0);
}

/** Platform snapshot — total revenue = wallet collections (money in), not call/chat usage. */
export async function getPlatformRevenueForRange(since?: Date | null): Promise<PlatformRevenueSnapshot> {
  const [breakdown, receiverWithdrawalPayout, walletCollections] = await Promise.all([
    aggregateAdminEarnings(since),
    aggregateReceiverWithdrawalPayouts(since ?? null),
    aggregateWalletTopupCollections(since ?? null),
  ]);
  const callerUsageSpend = breakdown.totalRevenue;
  const adminEarnings = computeAdminTotalEarned(
    walletCollections,
    receiverWithdrawalPayout,
    breakdown.withdrawalFeeEarnings,
    breakdown.referralRewardsPaid
  );
  return {
    totalRevenue: walletCollections,
    walletCollections,
    callerUsageSpend,
    adminEarnings,
    receiverRevenue: receiverWithdrawalPayout,
    callerGross: callerUsageSpend,
    breakdown,
  };
}

export async function getAdminEarningsSnapshot(): Promise<{
  lifetime: AdminEarningsBreakdown;
  today: AdminEarningsBreakdown;
  thisWeek: AdminEarningsBreakdown;
  walletCollections: { lifetime: number; today: number; thisWeek: number };
  receiverWithdrawalPayout: { lifetime: number; today: number; thisWeek: number };
  totalEarned: { lifetime: number; today: number; thisWeek: number };
  reservedInr: number;
  withdrawnInr: number;
  withdrawableInr: number;
}> {
  const todayStart = startOfLocalDay();
  const weekStart = startOfLocalWeek();

  const [
    lifetime,
    today,
    thisWeek,
    reservedInr,
    collectionsLifetime,
    collectionsToday,
    collectionsWeek,
    withdrawalPayoutLifetime,
    withdrawalPayoutToday,
    withdrawalPayoutWeek,
  ] = await Promise.all([
    aggregateAdminEarnings(null),
    aggregateAdminEarnings(todayStart),
    aggregateAdminEarnings(weekStart),
    computeReservedAdminEarningsInr(),
    aggregateWalletTopupCollections(null),
    aggregateWalletTopupCollections(todayStart),
    aggregateWalletTopupCollections(weekStart),
    aggregateReceiverWithdrawalPayouts(null),
    aggregateReceiverWithdrawalPayouts(todayStart),
    aggregateReceiverWithdrawalPayouts(weekStart),
  ]);

  const withdrawnInr = reservedInr;
  const totalEarned = {
    lifetime: computeAdminTotalEarned(
      collectionsLifetime,
      withdrawalPayoutLifetime,
      lifetime.withdrawalFeeEarnings,
      lifetime.referralRewardsPaid
    ),
    today: computeAdminTotalEarned(
      collectionsToday,
      withdrawalPayoutToday,
      today.withdrawalFeeEarnings,
      today.referralRewardsPaid
    ),
    thisWeek: computeAdminTotalEarned(
      collectionsWeek,
      withdrawalPayoutWeek,
      thisWeek.withdrawalFeeEarnings,
      thisWeek.referralRewardsPaid
    ),
  };
  const withdrawableInr = roundInr(Math.max(0, totalEarned.lifetime - reservedInr));

  return {
    lifetime,
    today,
    thisWeek,
    walletCollections: {
      lifetime: collectionsLifetime,
      today: collectionsToday,
      thisWeek: collectionsWeek,
    },
    receiverWithdrawalPayout: {
      lifetime: withdrawalPayoutLifetime,
      today: withdrawalPayoutToday,
      thisWeek: withdrawalPayoutWeek,
    },
    totalEarned,
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

type DailyRevenueAgg = { revenue: number; payout: number; commission: number };

/** Platform fee applies only when the paid total includes the fee (post-fee recharge packs). */
export function resolveWalletTopupPlatformFee(row: {
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
  callerUsageSpend: number;
  callerRechargeCommission: number;
  receiverWithdrawalCommission: number;
  referralRewardsPaid: number;
};

export type RevenueTopEarnerRow = {
  receiverId: string;
  name: string;
  calls: number;
  earnings: number;
  payout: number;
};

/** Admin revenue dashboard — wallet collections, paid withdrawals, and platform fees. */
export async function getRevenueDashboardMetrics(since: Date | null): Promise<{
  cards: RevenueDashboardCards;
  dailyBreakdown: RevenueDashboardDailyRow[];
  topEarners: RevenueTopEarnerRow[];
}> {
  const topupMatch: Record<string, unknown> = {};
  const withdrawalMatch = paidWithdrawalMatch(since);
  const callMatch: Record<string, unknown> = {
    status: 'completed',
    settledAmountInr: { $gt: 0 },
  };
  const chatMatch: Record<string, unknown> = { senderType: 'u', feeInr: { $gt: 0 } };
  if (since) {
    topupMatch.createdAt = { $gte: since };
    callMatch.startedAt = { $gte: since };
    chatMatch.createdAt = { $gte: since };
  }

  const [topups, paidWithdrawals, referralRewardsPaid, calls, chats] = await Promise.all([
    WalletTopup.find(topupMatch)
      .select('payAmount bonusPercent creditAdded createdAt')
      .lean<{ payAmount: number; bonusPercent: number; creditAdded: number; createdAt: Date }[]>(),
    WithdrawalRequest.find(withdrawalMatch)
      .select('receiverId amount payoutAmount platformFee reviewedAt walletDebitedAt')
      .lean<
        {
          receiverId: mongoose.Types.ObjectId;
          amount: number;
          payoutAmount?: number | null;
          platformFee?: number | null;
          reviewedAt?: Date | null;
          walletDebitedAt?: Date | null;
        }[]
      >(),
    aggregateReferralRewardsPaid(since),
    CallSession.find(callMatch)
      .select('settledAmountInr receiverEarnedInr receiverPayoutRatePerMinute durationSec')
      .lean<
        {
          settledAmountInr?: number;
          receiverEarnedInr?: number;
          receiverPayoutRatePerMinute?: number;
          durationSec?: number;
        }[]
      >(),
    ChatMessage.find(chatMatch).select('feeInr').lean<{ feeInr: number }[]>(),
  ]);

  const dailyMap = new Map<string, DailyRevenueAgg>();
  const receiverPaid = new Map<string, { withdrawals: number; gross: number; net: number }>();

  let grossRevenue = 0;
  let callerRechargeCommission = 0;

  for (const row of topups) {
    const payAmount = roundInr(Number(row.payAmount) || 0);
    const rechargeFee = resolveWalletTopupPlatformFee(row);
    grossRevenue += payAmount;
    callerRechargeCommission += rechargeFee;

    const key = localDateKey(row.createdAt);
    const daily = dailyMap.get(key) ?? { revenue: 0, payout: 0, commission: 0 };
    daily.revenue = roundInr(daily.revenue + payAmount);
    daily.commission = roundInr(daily.commission + rechargeFee);
    dailyMap.set(key, daily);
  }
  grossRevenue = roundInr(grossRevenue);
  callerRechargeCommission = roundInr(callerRechargeCommission);

  let netPayout = 0;
  let receiverWithdrawalCommission = 0;

  for (const row of paidWithdrawals) {
    const net = resolveWithdrawalPayoutAmount(row);
    const fee = roundInr(Number(row.platformFee) || 0);
    netPayout += net;
    receiverWithdrawalCommission += fee;

    const paidAt = row.reviewedAt ?? row.walletDebitedAt;
    if (paidAt) {
      const key = localDateKey(paidAt);
      const daily = dailyMap.get(key) ?? { revenue: 0, payout: 0, commission: 0 };
      daily.payout = roundInr(daily.payout + net);
      daily.commission = roundInr(daily.commission + fee);
      dailyMap.set(key, daily);
    }

    const rid = String(row.receiverId);
    const agg = receiverPaid.get(rid) ?? { withdrawals: 0, gross: 0, net: 0 };
    agg.withdrawals += 1;
    agg.gross = roundInr(agg.gross + Number(row.amount) || 0);
    agg.net = roundInr(agg.net + net);
    receiverPaid.set(rid, agg);
  }
  netPayout = roundInr(netPayout);
  receiverWithdrawalCommission = roundInr(receiverWithdrawalCommission);

  let usageGross = 0;
  let usagePayout = 0;
  for (const row of calls) {
    usageGross += roundInr(Number(row.settledAmountInr || 0));
    usagePayout += effectiveCallReceiverEarnedInr(row);
  }
  for (const row of chats) {
    usageGross += CHAT_TEXT_CHARGE_INR;
    usagePayout += roundInr(Number(row.feeInr || 0));
  }
  const callerUsageSpend = roundInr(usageGross);
  const usageCommission = roundInr(Math.max(0, usageGross - usagePayout));

  const platformCommission = roundInr(callerRechargeCommission + receiverWithdrawalCommission);
  const platformProfit = computeAdminTotalEarned(
    grossRevenue,
    netPayout,
    receiverWithdrawalCommission,
    referralRewardsPaid
  );

  const dailyBreakdown: RevenueDashboardDailyRow[] = [...dailyMap.entries()]
    .sort((a, b) => (a[0] > b[0] ? -1 : 1))
    .slice(0, since ? undefined : 90)
    .map(([date, row]) => ({
      date,
      revenue: row.revenue,
      payout: row.payout,
      commission: row.commission,
    }));

  const topReceiverIds = [...receiverPaid.entries()]
    .sort((a, b) => b[1].net - a[1].net)
    .slice(0, 10)
    .map(([rid]) => new mongoose.Types.ObjectId(rid));
  const receiverRows =
    topReceiverIds.length > 0
      ? await Receiver.find({ _id: { $in: topReceiverIds } })
          .select('_id name')
          .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>()
      : [];
  const receiverNameById = new Map(receiverRows.map((r) => [String(r._id), r.name]));

  const topEarners: RevenueTopEarnerRow[] = [...receiverPaid.entries()]
    .sort((a, b) => b[1].net - a[1].net)
    .slice(0, 5)
    .map(([rid, v]) => ({
      receiverId: rid,
      name: receiverNameById.get(rid) ?? 'Receiver',
      calls: v.withdrawals,
      earnings: roundInr(v.gross),
      payout: roundInr(v.net),
    }));

  return {
    cards: {
      grossRevenue,
      platformCommission,
      netPayout,
      platformProfit,
      usageCommission,
      callerUsageSpend,
      callerRechargeCommission,
      receiverWithdrawalCommission,
      referralRewardsPaid,
    },
    dailyBreakdown,
    topEarners,
  };
}
