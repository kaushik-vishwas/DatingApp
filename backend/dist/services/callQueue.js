"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReceiverBusy = isReceiverBusy;
exports.getBusyReceiverIdSet = getBusyReceiverIdSet;
exports.tryReserveReceiver = tryReserveReceiver;
exports.releaseReceiverReservation = releaseReceiverReservation;
exports.releaseIfStaleReceiverBusy = releaseIfStaleReceiverBusy;
exports.releaseStaleReceiverBusyFlags = releaseStaleReceiverBusyFlags;
exports.removeReceiverFromQueue = removeReceiverFromQueue;
exports.setReceiverQueuePresence = setReceiverQueuePresence;
exports.isReceiverInQueueScreen = isReceiverInQueueScreen;
exports.syncReceiverQueueState = syncReceiverQueueState;
const mongoose_1 = __importDefault(require("mongoose"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const callInviteRegistry_1 = require("./callInviteRegistry");
const socketRegistry_1 = require("../socket/socketRegistry");
const waitingReceiverIds = new Set();
const busyReceiverIds = new Set();
const queueActiveReceiverIds = new Set();
function normalizeId(id) {
    return String(id).trim();
}
function isReceiverBusy(receiverId) {
    return busyReceiverIds.has(normalizeId(receiverId));
}
const busyPersistTail = new Map();
/**
 * Writes the in-memory busy bit. Updates for one receiver run in order, and each write
 * reads the set at send time, so an older "not busy" cannot land after a newer "busy".
 */
function persistReceiverBusyFlag(receiverId) {
    const rid = normalizeId(receiverId);
    if (!rid || !mongoose_1.default.Types.ObjectId.isValid(rid))
        return;
    const prev = busyPersistTail.get(rid) ?? Promise.resolve();
    const next = prev
        .catch(() => undefined)
        .then(async () => {
        const busy = busyReceiverIds.has(rid);
        await Receiver_1.default.updateOne({ _id: rid }, { $set: { isBusyOnCall: busy } }).exec();
    });
    busyPersistTail.set(rid, next);
}
function rememberReceiverBusy(receiverId) {
    if (busyReceiverIds.has(receiverId))
        return;
    busyReceiverIds.add(receiverId);
    waitingReceiverIds.delete(receiverId);
    persistReceiverBusyFlag(receiverId);
}
function forgetReceiverBusy(receiverId) {
    const had = busyReceiverIds.delete(receiverId);
    if (had)
        persistReceiverBusyFlag(receiverId);
}
/**
 * Busy means a live ring on this process, or a call session that is still ongoing.
 * A saved `isBusyOnCall` with neither of those is cleared so admin does not keep showing Busy.
 */
async function getBusyReceiverIdSet(receiverIds) {
    const requested = [];
    for (const raw of receiverIds) {
        const id = normalizeId(raw);
        if (id)
            requested.push(id);
    }
    const flagged = await Receiver_1.default.find({ isBusyOnCall: true })
        .select('_id')
        .lean();
    const flaggedIds = new Set(flagged.map((row) => String(row._id)));
    const toCheck = new Set([...requested, ...flaggedIds, ...busyReceiverIds]);
    const oids = [];
    for (const id of toCheck) {
        if (mongoose_1.default.Types.ObjectId.isValid(id))
            oids.push(new mongoose_1.default.Types.ObjectId(id));
    }
    const ongoing = oids.length === 0
        ? []
        : await CallSession_1.default.find({
            receiverId: { $in: oids },
            status: 'ongoing',
        })
            .select('receiverId')
            .lean();
    const ongoingIds = new Set(ongoing.map((row) => String(row.receiverId)));
    const live = (id) => ongoingIds.has(id) || (0, callInviteRegistry_1.hasPendingCallInviteForReceiver)(id);
    for (const id of toCheck) {
        if (live(id)) {
            rememberReceiverBusy(id);
            continue;
        }
        forgetReceiverBusy(id);
        if (flaggedIds.has(id))
            persistReceiverBusyFlag(id);
    }
    const set = new Set();
    for (const id of requested) {
        if (live(id))
            set.add(id);
    }
    return set;
}
function tryReserveReceiver(receiverId) {
    const rid = normalizeId(receiverId);
    if (!rid || busyReceiverIds.has(rid))
        return false;
    busyReceiverIds.add(rid);
    waitingReceiverIds.delete(rid);
    persistReceiverBusyFlag(rid);
    return true;
}
function releaseReceiverReservation(receiverId) {
    const rid = normalizeId(receiverId);
    busyReceiverIds.delete(rid);
    persistReceiverBusyFlag(rid);
}
/** Clears a busy reservation that is not a live ring or an ongoing call, including a leftover database flag. */
async function releaseIfStaleReceiverBusy(receiverId) {
    const rid = normalizeId(receiverId);
    if (!rid || !mongoose_1.default.Types.ObjectId.isValid(rid))
        return;
    if ((0, callInviteRegistry_1.hasPendingCallInviteForReceiver)(rid))
        return;
    const oid = new mongoose_1.default.Types.ObjectId(rid);
    const [ongoing, flagged] = await Promise.all([
        CallSession_1.default.exists({ receiverId: oid, status: 'ongoing' }),
        Receiver_1.default.exists({ _id: oid, isBusyOnCall: true }),
    ]);
    if (ongoing) {
        rememberReceiverBusy(rid);
        return;
    }
    const hadMemoryBusy = busyReceiverIds.delete(rid);
    if (hadMemoryBusy || flagged)
        persistReceiverBusyFlag(rid);
}
async function releaseStaleReceiverBusyFlags() {
    const snapshot = [...busyReceiverIds];
    for (const rid of snapshot) {
        await releaseIfStaleReceiverBusy(rid);
    }
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
        (0, socketRegistry_1.isReceiverSocketConnected)(rid) &&
        receiver.isAvailable;
    if (eligible && !busyReceiverIds.has(rid)) {
        waitingReceiverIds.add(rid);
        return;
    }
    waitingReceiverIds.delete(rid);
}
