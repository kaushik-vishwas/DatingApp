"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeReservedAdminEarningsInr = computeReservedAdminEarningsInr;
exports.getPlatformRevenueForRange = getPlatformRevenueForRange;
exports.getAdminEarningsSnapshot = getAdminEarningsSnapshot;
const CallSession_1 = __importDefault(require("../models/CallSession"));
const ChatMessage_1 = __importDefault(require("../models/ChatMessage"));
const AdminWithdrawalRequest_1 = __importDefault(require("../models/AdminWithdrawalRequest"));
const chatPricing_1 = require("../constants/chatPricing");
const receiverCallEarnings_1 = require("../utils/receiverCallEarnings");
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
function finalizeBreakdown(parts) {
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
async function aggregateAdminEarnings(since) {
    const callerSpendMatch = {
        status: 'completed',
        settledAmountInr: { $gt: 0 },
    };
    const payoutCallMatch = { status: 'completed', durationSec: { $gt: 0 } };
    if (since) {
        callerSpendMatch.startedAt = { $gte: since };
        payoutCallMatch.startedAt = { $gte: since };
    }
    const [callerSpendRows, callPayoutRows] = await Promise.all([
        CallSession_1.default.aggregate([
            { $match: callerSpendMatch },
            {
                $group: {
                    _id: null,
                    callerGross: { $sum: '$settledAmountInr' },
                    calls: { $sum: 1 },
                },
            },
        ]),
        CallSession_1.default.aggregate([
            { $match: payoutCallMatch },
            {
                $addFields: {
                    settled: { $ifNull: ['$settledAmountInr', 0] },
                    resolvedReceiverPayout: receiverCallEarnings_1.RESOLVED_RECEIVER_CALL_EARNING_EXPR,
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
    const chatMatch = { senderType: 'u', feeInr: { $gt: 0 } };
    if (since)
        chatMatch.createdAt = { $gte: since };
    const [chatAgg] = await ChatMessage_1.default.aggregate([
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
    ]);
    return finalizeBreakdown({
        callEarnings: callAgg?.callEarnings ?? 0,
        messageEarnings: chatAgg?.messageEarnings ?? 0,
        calls: callerSpendAgg?.calls ?? callAgg?.calls ?? 0,
        messages: chatAgg?.messages ?? 0,
        callerCallGross: callerSpendAgg?.callerGross ?? 0,
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
/** Total revenue = actual caller wallet debits (call settlements + chat charges). */
async function getPlatformRevenueForRange(since) {
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
async function getAdminEarningsSnapshot() {
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
