"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateReceiverWithdrawalPayouts = aggregateReceiverWithdrawalPayouts;
exports.countPaidReceiverWithdrawals = countPaidReceiverWithdrawals;
exports.computeAdminTotalEarned = computeAdminTotalEarned;
exports.aggregateReferralRewardsPaid = aggregateReferralRewardsPaid;
exports.computeReservedAdminEarningsInr = computeReservedAdminEarningsInr;
exports.aggregateWalletTopupCollections = aggregateWalletTopupCollections;
exports.getPlatformRevenueForRange = getPlatformRevenueForRange;
exports.getAdminEarningsSnapshot = getAdminEarningsSnapshot;
exports.resolveWalletTopupPlatformFee = resolveWalletTopupPlatformFee;
exports.getRevenueDashboardMetrics = getRevenueDashboardMetrics;
const CallSession_1 = __importDefault(require("../models/CallSession"));
const ChatMessage_1 = __importDefault(require("../models/ChatMessage"));
const AdminWithdrawalRequest_1 = __importDefault(require("../models/AdminWithdrawalRequest"));
const WithdrawalRequest_1 = __importDefault(require("../models/WithdrawalRequest"));
const WalletTopup_1 = __importDefault(require("../models/WalletTopup"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const Referral_1 = __importDefault(require("../models/Referral"));
const mongoose_1 = __importDefault(require("mongoose"));
const chatPricing_1 = require("../constants/chatPricing");
const walletRechargeFees_1 = require("../constants/walletRechargeFees");
const receiverWithdrawalFees_1 = require("../constants/receiverWithdrawalFees");
const receiverCallEarnings_1 = require("../utils/receiverCallEarnings");
const receiverCallEarnings_2 = require("../utils/receiverCallEarnings");
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
function startOfLocalDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function startOfLocalWeek(d = new Date()) {
    const x = startOfLocalDay(d);
    const day = x.getDay();
    const diff = day === 0 ? 6 : day - 1;
    x.setDate(x.getDate() - diff);
    return x;
}
/** Net amount actually paid to receivers — only payoutStatus success (not pending / failed / processing). */
async function aggregateReceiverWithdrawalPayouts(since, extraMatch = {}) {
    const rows = await WithdrawalRequest_1.default.find({ ...(0, receiverWithdrawalFees_1.paidWithdrawalMatch)(since), ...extraMatch })
        .select('amount payoutAmount')
        .lean();
    let total = 0;
    for (const row of rows) {
        total += (0, receiverWithdrawalFees_1.resolveWithdrawalPayoutAmount)(row);
    }
    return roundInr(total);
}
/** Count of withdrawals actually paid out. */
async function countPaidReceiverWithdrawals(since, extraMatch = {}) {
    return WithdrawalRequest_1.default.countDocuments({ ...(0, receiverWithdrawalFees_1.paidWithdrawalMatch)(since), ...extraMatch });
}
/** Admin total earned = caller revenue − receiver withdrawals paid + withdrawal fees − referral rewards. */
function computeAdminTotalEarned(totalRevenue, receiverWithdrawalPayout, withdrawalFeeEarnings, referralRewardsPaid) {
    return roundInr(Math.max(0, totalRevenue - receiverWithdrawalPayout + withdrawalFeeEarnings - referralRewardsPaid));
}
async function aggregateWithdrawalPlatformFees(since) {
    const match = (0, receiverWithdrawalFees_1.paidWithdrawalMatch)(since);
    const [agg] = await WithdrawalRequest_1.default.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$platformFee', 0] } } } },
    ]);
    return roundInr(agg?.total ?? 0);
}
/** Refer-and-earn payouts are funded from platform admin earnings only. */
async function aggregateReferralRewardsPaid(since) {
    const match = { status: 'rewarded' };
    if (since)
        match.rewardedAt = { $gte: since };
    const [agg] = await Referral_1.default.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$rewardInr' } } },
    ]);
    return roundInr(agg?.total ?? 0);
}
function finalizeBreakdown(parts) {
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
async function aggregateAdminEarnings(since) {
    const callMatch = { status: 'completed' };
    if (since)
        callMatch.startedAt = { $gte: since };
    const [callAgg] = await CallSession_1.default.aggregate([
        { $match: callMatch },
        {
            $addFields: {
                settled: { $ifNull: ['$settledAmountInr', 0] },
                resolvedReceiverPayout: receiverCallEarnings_1.RESOLVED_RECEIVER_CALL_EARNING_EXPR,
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
    const chatMatch = { senderType: 'u', feeInr: { $gt: 0 } };
    if (since)
        chatMatch.createdAt = { $gte: since };
    const [chatAgg, withdrawalFeeEarnings, referralRewardsPaid] = await Promise.all([
        ChatMessage_1.default.aggregate([
            { $match: chatMatch },
            {
                $addFields: {
                    messageMargin: {
                        $max: [0, { $subtract: [chatPricing_1.CHAT_TEXT_CHARGE_INR, { $ifNull: ['$feeInr', 0] }] }],
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    callerMessageGross: { $sum: chatPricing_1.CHAT_TEXT_CHARGE_INR },
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
async function computeReservedAdminEarningsInr() {
    const [agg] = await AdminWithdrawalRequest_1.default.aggregate([
        { $match: { payoutStatus: { $in: ['processing', 'success'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return roundInr(agg?.total ?? 0);
}
/** Sum of successful wallet recharges (`WalletTopup.payAmount`) — matches Transactions / Razorpay collections. */
async function aggregateWalletTopupCollections(since) {
    const match = {};
    if (since)
        match.createdAt = { $gte: since };
    const [agg] = await WalletTopup_1.default.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$payAmount', 0] } } } },
    ]);
    return roundInr(agg?.total ?? 0);
}
/** Platform snapshot — total revenue = wallet collections (money in), not call/chat usage. */
async function getPlatformRevenueForRange(since) {
    const [breakdown, receiverWithdrawalPayout, walletCollections] = await Promise.all([
        aggregateAdminEarnings(since),
        aggregateReceiverWithdrawalPayouts(since ?? null),
        aggregateWalletTopupCollections(since ?? null),
    ]);
    const callerUsageSpend = breakdown.totalRevenue;
    const adminEarnings = computeAdminTotalEarned(walletCollections, receiverWithdrawalPayout, breakdown.withdrawalFeeEarnings, breakdown.referralRewardsPaid);
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
async function getAdminEarningsSnapshot() {
    const todayStart = startOfLocalDay();
    const weekStart = startOfLocalWeek();
    const [lifetime, today, thisWeek, reservedInr, collectionsLifetime, collectionsToday, collectionsWeek, withdrawalPayoutLifetime, withdrawalPayoutToday, withdrawalPayoutWeek,] = await Promise.all([
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
        lifetime: computeAdminTotalEarned(collectionsLifetime, withdrawalPayoutLifetime, lifetime.withdrawalFeeEarnings, lifetime.referralRewardsPaid),
        today: computeAdminTotalEarned(collectionsToday, withdrawalPayoutToday, today.withdrawalFeeEarnings, today.referralRewardsPaid),
        thisWeek: computeAdminTotalEarned(collectionsWeek, withdrawalPayoutWeek, thisWeek.withdrawalFeeEarnings, thisWeek.referralRewardsPaid),
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
function localDateKey(d) {
    const x = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** Platform fee applies only when the paid total includes the fee (post-fee recharge packs). */
function resolveWalletTopupPlatformFee(row) {
    const credit = Number(row.creditAdded) || 0;
    const bonus = Number(row.bonusPercent) || 0;
    const payAmount = Number(row.payAmount) || 0;
    if (credit <= 0)
        return 0;
    const walletAmount = roundInr(credit / (1 + bonus / 100));
    if (walletAmount <= 0)
        return 0;
    if (payAmount > 0 && (0, walletRechargeFees_1.payableMatchesWalletPack)(walletAmount, payAmount, 0.05)) {
        return (0, walletRechargeFees_1.computeWalletRechargeBreakdown)(walletAmount).platformFee;
    }
    return 0;
}
async function aggregateCallerRechargePlatformFees(since) {
    const match = {};
    if (since)
        match.createdAt = { $gte: since };
    const rows = await WalletTopup_1.default.find(match)
        .select('payAmount bonusPercent creditAdded')
        .lean();
    let total = 0;
    for (const row of rows) {
        total += resolveWalletTopupPlatformFee(row);
    }
    return roundInr(total);
}
/** Admin revenue dashboard — wallet collections, paid withdrawals, and platform fees. */
async function getRevenueDashboardMetrics(since) {
    const topupMatch = {};
    const withdrawalMatch = (0, receiverWithdrawalFees_1.paidWithdrawalMatch)(since);
    const callMatch = {
        status: 'completed',
        settledAmountInr: { $gt: 0 },
    };
    const chatMatch = { senderType: 'u', feeInr: { $gt: 0 } };
    if (since) {
        topupMatch.createdAt = { $gte: since };
        callMatch.startedAt = { $gte: since };
        chatMatch.createdAt = { $gte: since };
    }
    const [topups, paidWithdrawals, referralRewardsPaid, calls, chats] = await Promise.all([
        WalletTopup_1.default.find(topupMatch)
            .select('payAmount bonusPercent creditAdded createdAt')
            .lean(),
        WithdrawalRequest_1.default.find(withdrawalMatch)
            .select('receiverId amount payoutAmount platformFee reviewedAt walletDebitedAt')
            .lean(),
        aggregateReferralRewardsPaid(since),
        CallSession_1.default.find(callMatch)
            .select('settledAmountInr receiverEarnedInr receiverPayoutRatePerMinute durationSec')
            .lean(),
        ChatMessage_1.default.find(chatMatch).select('feeInr').lean(),
    ]);
    const dailyMap = new Map();
    const receiverPaid = new Map();
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
        const net = (0, receiverWithdrawalFees_1.resolveWithdrawalPayoutAmount)(row);
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
        usagePayout += (0, receiverCallEarnings_2.effectiveCallReceiverEarnedInr)(row);
    }
    for (const row of chats) {
        usageGross += chatPricing_1.CHAT_TEXT_CHARGE_INR;
        usagePayout += roundInr(Number(row.feeInr || 0));
    }
    const callerUsageSpend = roundInr(usageGross);
    const usageCommission = roundInr(Math.max(0, usageGross - usagePayout));
    const platformCommission = roundInr(callerRechargeCommission + receiverWithdrawalCommission);
    const platformProfit = computeAdminTotalEarned(grossRevenue, netPayout, receiverWithdrawalCommission, referralRewardsPaid);
    const dailyBreakdown = [...dailyMap.entries()]
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
        .map(([rid]) => new mongoose_1.default.Types.ObjectId(rid));
    const receiverRows = topReceiverIds.length > 0
        ? await Receiver_1.default.find({ _id: { $in: topReceiverIds } })
            .select('_id name')
            .lean()
        : [];
    const receiverNameById = new Map(receiverRows.map((r) => [String(r._id), r.name]));
    const topEarners = [...receiverPaid.entries()]
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
