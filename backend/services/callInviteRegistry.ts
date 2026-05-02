/**
 * Receivers with an in-memory call invite in chatSocket (ringing or in-call until `call:end`).
 * Used to tell whether an in-process invite explains `busyReceiverIds` vs a stale flag.
 */
const receiverIds = new Set<string>();

function norm(id: string): string {
  return String(id).trim();
}

export function registerPendingCallInvite(receiverId: string): void {
  receiverIds.add(norm(receiverId));
}

export function unregisterPendingCallInvite(receiverId: string): void {
  receiverIds.delete(norm(receiverId));
}

export function hasPendingCallInviteForReceiver(receiverId: string): boolean {
  return receiverIds.has(norm(receiverId));
}
