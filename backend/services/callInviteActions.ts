/**
 * Bridge from REST controllers to the in-memory call-invite state owned by `socket/chatSocket.ts`.
 * Native Android code (no JS running) uses these to decline an invite and to acknowledge that
 * the incoming-call notification actually rang on the device.
 */

export type InviteActionResult =
  | { ok: true; alreadyAccepted?: boolean }
  | { ok: false; error: 'Unknown call invite' | 'Forbidden' | 'Unavailable' };

type InviteActionHandlers = {
  declineByReceiver: (callId: string, receiverId: string) => InviteActionResult;
  acknowledgeRinging: (callId: string, receiverId: string) => InviteActionResult;
};

let handlers: InviteActionHandlers | null = null;

export function registerCallInviteActions(next: InviteActionHandlers): void {
  handlers = next;
}

export function declineInviteByReceiver(callId: string, receiverId: string): InviteActionResult {
  return handlers?.declineByReceiver(callId, receiverId) ?? { ok: false, error: 'Unavailable' };
}

export function acknowledgeInviteRinging(callId: string, receiverId: string): InviteActionResult {
  return handlers?.acknowledgeRinging(callId, receiverId) ?? { ok: false, error: 'Unavailable' };
}

/**
 * Receivers whose app has sent at least one native ring ack (this server process). Only these are
 * held to the ack deadline — old app builds and iOS never ack and must not be marked unreachable.
 */
const ringAckCapableReceivers = new Set<string>();

export function markReceiverRingAckCapable(receiverId: string): void {
  ringAckCapableReceivers.add(String(receiverId).trim());
}

export function isReceiverRingAckCapable(receiverId: string): boolean {
  return ringAckCapableReceivers.has(String(receiverId).trim());
}
