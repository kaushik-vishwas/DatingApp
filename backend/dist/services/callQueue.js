"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReceiverBusy = isReceiverBusy;
exports.tryReserveReceiver = tryReserveReceiver;
exports.releaseReceiverReservation = releaseReceiverReservation;
exports.removeReceiverFromQueue = removeReceiverFromQueue;
exports.setReceiverQueuePresence = setReceiverQueuePresence;
exports.isReceiverInQueueScreen = isReceiverInQueueScreen;
exports.syncReceiverQueueState = syncReceiverQueueState;
exports.pickRandomQueuedReceiverForCaller = pickRandomQueuedReceiverForCaller;
const mongoose_1 = __importDefault(require("mongoose"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const ReceiverPriorityNotification_1 = __importDefault(require("../models/ReceiverPriorityNotification"));
const waitingReceiverIds = new Set();
const busyReceiverIds = new Set();
const queueActiveReceiverIds = new Set();
function normalizeId(id) {
    return String(id).trim();
}
function isReceiverBusy(receiverId) {
    return busyReceiverIds.has(normalizeId(receiverId));
}
function tryReserveReceiver(receiverId) {
    const rid = normalizeId(receiverId);
    if (!rid || busyReceiverIds.has(rid))
        return false;
    busyReceiverIds.add(rid);
    waitingReceiverIds.delete(rid);
    return true;
}
function releaseReceiverReservation(receiverId) {
    busyReceiverIds.delete(normalizeId(receiverId));
}
function removeReceiverFromQueue(receiverId) {
    waitingReceiverIds.delete(normalizeId(receiverId));
}
function setReceiverQueuePresence(receiverId, active) {
    const rid = normalizeId(receiverId);
    if (!rid)
        return;
    if (active) {
        queueActiveReceiverIds.add(rid);
        return;
    }
    queueActiveReceiverIds.delete(rid);
}
function isReceiverInQueueScreen(receiverId) {
    return queueActiveReceiverIds.has(normalizeId(receiverId));
}
async function syncReceiverQueueState(receiverId) {
    const rid = normalizeId(receiverId);
    if (!mongoose_1.default.Types.ObjectId.isValid(rid)) {
        waitingReceiverIds.delete(rid);
        busyReceiverIds.delete(rid);
        return;
    }
    const receiver = await Receiver_1.default.findById(rid).select('accountStatus suspended isOnline isAvailable');
    const eligible = Boolean(receiver) &&
        receiver.accountStatus === 'approved' &&
        !receiver.suspended &&
        receiver.isOnline &&
        receiver.isAvailable;
    if (eligible && !busyReceiverIds.has(rid)) {
        waitingReceiverIds.add(rid);
        return;
    }
    waitingReceiverIds.delete(rid);
}
/**
 * Pick a random receiver who can take a call right now: approved, online, available,
 * not busy, not blocked by this caller. Does not require "queue" or Go Online screen.
 */
async function pickRandomQueuedReceiverForCaller(callerId) {
    const cid = normalizeId(callerId);
    if (!mongoose_1.default.Types.ObjectId.isValid(cid))
        return null;
    const baseFilter = {
        accountStatus: 'approved',
        suspended: { $ne: true },
        isOnline: true,
        isAvailable: true,
    };
    const candidates = await Receiver_1.default.find(baseFilter)
        .select('_id name profileImage audioCallRate')
        .lean();
    const eligibleRows = candidates.filter((r) => {
        const id = String(r._id);
        return !busyReceiverIds.has(id);
    });
    if (eligibleRows.length === 0)
        return null;
    const eligibleIds = eligibleRows.map((r) => r._id);
    const blockedIds = await ChatBlock_1.default.distinct('receiverId', {
        userId: new mongoose_1.default.Types.ObjectId(cid),
        receiverId: { $in: eligibleIds },
    });
    const blockedSet = new Set(blockedIds.map((id) => String(id)));
    const eligible = eligibleRows.filter((r) => !blockedSet.has(String(r._id)));
    if (eligible.length === 0)
        return null;
    const eligibleById = new Map(eligible.map((r) => [String(r._id), r]));
    const priorityRows = await ReceiverPriorityNotification_1.default.find({
        userId: new mongoose_1.default.Types.ObjectId(cid),
        priorityUntil: { $gt: new Date() },
        receiverId: {
            $in: [...eligibleById.keys()].map((id) => new mongoose_1.default.Types.ObjectId(id)),
        },
    })
        .sort({ lastNotifiedAt: -1 })
        .limit(5)
        .select('receiverId')
        .lean();
    for (const row of priorityRows) {
        const prioritized = eligibleById.get(String(row.receiverId));
        if (!prioritized)
            continue;
        return {
            receiverId: String(prioritized._id),
            name: prioritized.name,
            profileImage: prioritized.profileImage ?? null,
            audioCallRate: typeof prioritized.audioCallRate === 'number' && Number.isFinite(prioritized.audioCallRate)
                ? prioritized.audioCallRate
                : null,
        };
    }
    const chosen = eligible[Math.floor(Math.random() * eligible.length)];
    if (!chosen)
        return null;
    return {
        receiverId: String(chosen._id),
        name: chosen.name,
        profileImage: chosen.profileImage ?? null,
        audioCallRate: typeof chosen.audioCallRate === 'number' && Number.isFinite(chosen.audioCallRate)
            ? chosen.audioCallRate
            : null,
    };
}
