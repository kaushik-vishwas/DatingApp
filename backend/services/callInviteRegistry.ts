/**
 * Receivers with an in-memory call invite in chatSocket (ringing or in-call until `call:end`).
 * Used to tell whether an in-process invite explains `busyReceiverIds` vs a stale flag.
 * Tracked per call so ending one call never clears a newer invite to the same receiver.
 */
const callIdsByReceiverId = new Map<string, Set<string>>();

function norm(id: string): string {
  return String(id).trim();
}

export function registerPendingCallInvite(receiverId: string, callId: string): void {
  const rid = norm(receiverId);
  const calls = callIdsByReceiverId.get(rid) ?? new Set<string>();
  calls.add(norm(callId));
  callIdsByReceiverId.set(rid, calls);
}

export function unregisterPendingCallInvite(receiverId: string, callId: string): void {
  const rid = norm(receiverId);
  const calls = callIdsByReceiverId.get(rid);
  if (!calls) return;
  calls.delete(norm(callId));
  if (calls.size === 0) callIdsByReceiverId.delete(rid);
}

export function hasPendingCallInviteForReceiver(receiverId: string): boolean {
  return (callIdsByReceiverId.get(norm(receiverId))?.size ?? 0) > 0;
}
