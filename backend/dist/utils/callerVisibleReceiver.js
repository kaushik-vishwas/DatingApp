"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callerVisibleReceiverMongoFilter = void 0;
exports.isCallerVisibleReceiver = isCallerVisibleReceiver;
/** Receivers callers may see in discover, recents, chats, and messaging. */
exports.callerVisibleReceiverMongoFilter = {
    suspended: { $ne: true },
    accountStatus: 'approved',
};
function isCallerVisibleReceiver(receiver) {
    if (!receiver)
        return false;
    if (Boolean(receiver.suspended))
        return false;
    return receiver.accountStatus === 'approved';
}
