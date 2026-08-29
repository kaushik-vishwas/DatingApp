import type { ReceiverDocument } from '../models/Receiver';

/** Receivers callers may see in discover, recents, chats, and messaging. */
export const callerVisibleReceiverMongoFilter = {
  suspended: { $ne: true },
  accountStatus: 'approved' as const,
};

export function isCallerVisibleReceiver(
  receiver: Pick<ReceiverDocument, 'accountStatus' | 'suspended'> | null | undefined
): boolean {
  if (!receiver) return false;
  if (Boolean(receiver.suspended)) return false;
  return receiver.accountStatus === 'approved';
}
