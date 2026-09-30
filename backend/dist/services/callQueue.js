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
function persistReceiverBusyFlag(receiverId, busy) {
    const rid = normalizeId(receiverId);
    if (!rid || !mongoose_1.default.Types.ObjectId.isValid(rid))
        return;
    void Receiver_1.default.updateOne({ _id: rid }, { $set: { isBusyOnCall: busy } }).exec();
}
/** In-memory invite/reservation, plus an actual ongoing voice session. */
async function getBusyReceiverIdSet(receiverIds) {
    const set = new Set();
    const oids = [];
    for (const raw of receiverIds) {
        const id = normalizeId(raw);
        if (!id)
            continue;
        if (busyReceiverIds.has(id) || (0, callInviteRegistry_1.hasPendingCallInviteForReceiver)(id))
            set.add(id);
        if (mongoose_1.default.Types.ObjectId.isValid(id))
            oids.push(new mongoose_1.default.Types.ObjectId(id));
    }
    if (oids.length === 0)
        return set;
    const [ongoing, busyRows] = await Promise.all([
        CallSession_1.default.find({
            receiverId: { $in: oids },
            status: 'ongoing',
        })
            .select('receiverId')
            .lean(),
        Receiver_1.default.find({
            _id: { $in: oids },
            isBusyOnCall: true,
        })
            .select('_id')
            .lean(),
    ]);
    for (const row of ongoing)
        set.add(String(row.receiverId));
    for (const row of busyRows)
        set.add(String(row._id));
    return set;
}
function tryReserveReceiver(receiverId) {
    const rid = normalizeId(receiverId);
    if (!rid || busyReceiverIds.has(rid))
        return false;
    busyReceiverIds.add(rid);
    waitingReceiverIds.delete(rid);
    persistReceiverBusyFlag(rid, true);
    return true;
}
function releaseReceiverReservation(receiverId) {
    const rid = normalizeId(receiverId);
    busyReceiverIds.delete(rid);
    persistReceiverBusyFlag(rid, false);
}
/** Clears in-memory "busy" when it is not backed by an ongoing session or an active socket invite. */
async function releaseIfStaleReceiverBusy(receiverId) {
    const rid = normalizeId(receiverId);
    if (!rid || !mongoose_1.default.Types.ObjectId.isValid(rid))
        return;
    if (!busyReceiverIds.has(rid))
        return;
    if ((0, callInviteRegistry_1.hasPendingCallInviteForReceiver)(rid))
        return;
    const ongoing = await CallSession_1.default.exists({
        receiverId: new mongoose_1.default.Types.ObjectId(rid),
        status: 'ongoing',
    });
    if (!ongoing) {
        busyReceiverIds.delete(rid);
        persistReceiverBusyFlag(rid, false);
    }
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
