"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordReceiverCallScore = recordReceiverCallScore;
exports.finalizeReceiverOnlineSession = finalizeReceiverOnlineSession;
const mongoose_1 = __importDefault(require("mongoose"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const ReceiverDailyScore_1 = __importDefault(require("../models/ReceiverDailyScore"));
const receiverEarningModel_1 = require("./receiverEarningModel");
const MAX_SCORED_CALLS_PER_CALLER_PER_DAY = 3;
const MIN_VALID_CALL_SECONDS = 60;
const MIN_MID_BAND_SECONDS = 3 * 60;
const MIN_TOP_BAND_SECONDS = 10 * 60;
const IST_OFFSET_MINUTES = 330;
function round2(n) {
    return Math.round(n * 100) / 100;
}
function utcDateKey(d) {
    return d.toISOString().slice(0, 10);
}
function dayStartUtc(dateKey) {
    return new Date(`${dateKey}T00:00:00.000Z`);
}
function badgeForScore(score) {
    if (score >= 12000)
        return { badgeLevel: 'supreme', ratePerMinute: 2.6 };
    if (score >= 8000)
        return { badgeLevel: 'diamond', ratePerMinute: 2.3 };
    return { badgeLevel: 'platinum', ratePerMinute: 2.0 };
}
function callScoreForDuration(durationSec) {
    if (durationSec < MIN_VALID_CALL_SECONDS)
        return 0;
    const minutes = durationSec / 60;
    if (durationSec >= MIN_TOP_BAND_SECONDS)
        return round2(minutes * 5);
    if (durationSec >= MIN_MID_BAND_SECONDS)
        return round2(minutes * 3);
    return 0;
}
async function recordReceiverCallScore(args) {
    const earningSettings = await (0, receiverEarningModel_1.getReceiverEarningSettings)();
    if (earningSettings.receiverEarningModel === 'fixed_per_minute') {
        return;
    }
    const { callId, receiverId, callerId, startedAt, durationSec } = args;
    const dateKey = utcDateKey(startedAt);
    if (durationSec < MIN_VALID_CALL_SECONDS) {
        await ReceiverDailyScore_1.default.findOneAndUpdate({ receiverId: new mongoose_1.default.Types.ObjectId(receiverId), dateKey }, { $inc: { shortCallsIgnored: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
        return;
    }
    const dayStart = dayStartUtc(dateKey);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const sameCallerCount = await CallSession_1.default.countDocuments({
        callId: { $ne: callId },
        receiverId: new mongoose_1.default.Types.ObjectId(receiverId),
        callerId: new mongoose_1.default.Types.ObjectId(callerId),
        status: 'completed',
        durationSec: { $gte: MIN_VALID_CALL_SECONDS },
        startedAt: { $gte: dayStart, $lt: dayEnd },
    });
    if (sameCallerCount >= MAX_SCORED_CALLS_PER_CALLER_PER_DAY) {
        await ReceiverDailyScore_1.default.findOneAndUpdate({ receiverId: new mongoose_1.default.Types.ObjectId(receiverId), dateKey }, { $inc: { spamCallsIgnored: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
        return;
    }
    const validCallMinutes = round2(durationSec / 60);
    const score = callScoreForDuration(durationSec);
    await ReceiverDailyScore_1.default.findOneAndUpdate({ receiverId: new mongoose_1.default.Types.ObjectId(receiverId), dateKey }, {
        $inc: {
            callScore: score,
            totalScore: score,
            validCallMinutes,
            validCalls: 1,
        },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const receiver = await Receiver_1.default.findById(receiverId).select('cumulativeScore cumulativeValidCallMinutes');
    if (!receiver)
        return;
    receiver.cumulativeScore = round2((receiver.cumulativeScore || 0) + score);
    receiver.cumulativeValidCallMinutes = round2((receiver.cumulativeValidCallMinutes || 0) + validCallMinutes);
    const badge = badgeForScore(receiver.cumulativeScore);
    receiver.badgeLevel = badge.badgeLevel;
    receiver.earningRatePerMinute = badge.ratePerMinute;
    await receiver.save();
}
function toIstDate(d) {
    return new Date(d.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}
function splitOnlineMinutes(start, end) {
    if (end <= start)
        return { dayMinutes: 0, nightMinutes: 0, lateNightMinutes: 0 };
    let dayMinutes = 0;
    let nightMinutes = 0;
    let lateNightMinutes = 0;
    const cursor = new Date(start.getTime());
    while (cursor < end) {
        const nextMinute = new Date(cursor.getTime() + 60 * 1000);
        const h = toIstDate(cursor).getUTCHours();
        if (h >= 9 && h < 21)
            dayMinutes += 1;
        else if (h >= 22)
            nightMinutes += 1;
        else if (h >= 0 && h < 2)
            lateNightMinutes += 1;
        cursor.setTime(nextMinute.getTime());
    }
    return { dayMinutes, nightMinutes, lateNightMinutes };
}
async function finalizeReceiverOnlineSession(args) {
    const { receiverId, onlineSince, endedAt } = args;
    if (endedAt <= onlineSince)
        return;
    const dateKey = utcDateKey(onlineSince);
    const { dayMinutes, nightMinutes, lateNightMinutes } = splitOnlineMinutes(onlineSince, endedAt);
    const onlineScore = round2(dayMinutes * 0.5 + nightMinutes * 3 + lateNightMinutes * 10);
    await ReceiverDailyScore_1.default.findOneAndUpdate({ receiverId: new mongoose_1.default.Types.ObjectId(receiverId), dateKey }, {
        $inc: {
            dayOnlineMinutes: dayMinutes,
            nightOnlineMinutes: nightMinutes,
            lateNightOnlineMinutes: lateNightMinutes,
            onlineScore,
            totalScore: onlineScore,
        },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const receiver = await Receiver_1.default.findById(receiverId).select('cumulativeScore');
    if (!receiver)
        return;
    receiver.cumulativeScore = round2((receiver.cumulativeScore || 0) + onlineScore);
    const badge = badgeForScore(receiver.cumulativeScore);
    receiver.badgeLevel = badge.badgeLevel;
    receiver.earningRatePerMinute = badge.ratePerMinute;
    await receiver.save();
}
