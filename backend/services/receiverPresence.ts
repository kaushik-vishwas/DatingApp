import Receiver from '../models/Receiver';
import { isReceiverSocketConnected } from '../socket/socketRegistry';
import { finalizeReceiverOnlineSession } from './receiverScore';
import { syncReceiverQueueState } from './callQueue';

/**
 * Rolling grace window renewed by JS / native keep-alive heartbeats while Go Online is on.
 * Long enough that brief OEM doze or network gaps do not drop discover presence.
 */
export const RECEIVER_DISCOVER_GRACE_MS = 24 * 60 * 60 * 1000;

/** Min interval between DB grace renewals (keep-alive polls every 4s). */
const BACKGROUND_PRESENCE_TOUCH_MIN_MS = 30_000;

const discoverGraceUntilByReceiverId = new Map<string, number>();
const discoverGraceExpireTimers = new Map<string, NodeJS.Timeout>();
const lastBackgroundPresenceTouchAt = new Map<string, number>();

function normalizeReceiverId(receiverId: string): string {
  return String(receiverId).trim();
}

function graceUntilDate(untilMs: number): Date {
  return new Date(untilMs);
}

function isDbGraceLive(discoverGraceUntil: Date | null | undefined): boolean {
  return discoverGraceUntil instanceof Date && discoverGraceUntil.getTime() > Date.now();
}

export function isReceiverInDiscoverGrace(
  receiverId: string,
  discoverGraceUntil?: Date | null
): boolean {
  const rid = normalizeReceiverId(receiverId);
  const until = discoverGraceUntilByReceiverId.get(rid);
  if (typeof until === 'number' && Date.now() < until) return true;
  if (isDbGraceLive(discoverGraceUntil)) return true;
  return false;
}

/** Socket connected now, or within the rolling grace window while Go Online is on. */
export function isReceiverDiscoverPresenceLive(
  receiverId: string,
  discoverGraceUntil?: Date | null,
  _reachability?: { isAvailable?: boolean; expoPushToken?: string | null; fcmDeviceToken?: string | null }
): boolean {
  const rid = normalizeReceiverId(receiverId);
  return isReceiverSocketConnected(rid) || isReceiverInDiscoverGrace(rid, discoverGraceUntil);
}

/** Shown as online to callers and admin: Go Online switch on AND logged-in (socket or minimize grace). */
export function isReceiverLoggedInAndAvailable(opts: {
  receiverId: string;
  isAvailable: boolean;
  discoverGraceUntil?: Date | null;
}): boolean {
  if (!opts.isAvailable) return false;
  return isReceiverDiscoverPresenceLive(opts.receiverId, opts.discoverGraceUntil);
}

function scheduleGraceExpiry(rid: string): void {
  const prev = discoverGraceExpireTimers.get(rid);
  if (prev) clearTimeout(prev);
  discoverGraceExpireTimers.set(
    rid,
    setTimeout(() => {
      discoverGraceUntilByReceiverId.delete(rid);
      discoverGraceExpireTimers.delete(rid);
      void Receiver.findByIdAndUpdate(rid, { discoverGraceUntil: null }).exec();
      void syncReceiverPresenceInDatabase(rid);
    }, RECEIVER_DISCOVER_GRACE_MS)
  );
}

/** Synchronous in-memory + DB grace arm — safe to call from socket disconnect before any await. */
export function armReceiverDiscoverGraceImmediate(receiverId: string): number {
  const rid = normalizeReceiverId(receiverId);
  if (!rid) return 0;
  const until = Date.now() + RECEIVER_DISCOVER_GRACE_MS;
  discoverGraceUntilByReceiverId.set(rid, until);
  scheduleGraceExpiry(rid);
  void Receiver.findByIdAndUpdate(rid, { discoverGraceUntil: graceUntilDate(until) }).exec();
  return until;
}

export function clearReceiverDiscoverGrace(receiverId: string): void {
  const rid = normalizeReceiverId(receiverId);
  discoverGraceUntilByReceiverId.delete(rid);
  lastBackgroundPresenceTouchAt.delete(rid);
  const timer = discoverGraceExpireTimers.get(rid);
  if (timer) {
    clearTimeout(timer);
    discoverGraceExpireTimers.delete(rid);
  }
  void Receiver.findByIdAndUpdate(rid, { discoverGraceUntil: null }).exec();
}

export function armReceiverDiscoverGrace(receiverId: string): number {
  return armReceiverDiscoverGraceImmediate(receiverId);
}

function currentGraceUntilMs(
  receiverId: string,
  discoverGraceUntil?: Date | null
): number {
  const rid = normalizeReceiverId(receiverId);
  const mem = discoverGraceUntilByReceiverId.get(rid);
  if (typeof mem === 'number' && mem > Date.now()) return mem;
  if (discoverGraceUntil instanceof Date && discoverGraceUntil.getTime() > Date.now()) {
    return discoverGraceUntil.getTime();
  }
  return 0;
}

/** Client-driven (minimize / keep-alive): arm grace before socket loss or while backgrounded. */
export async function touchReceiverBackgroundPresence(receiverId: string): Promise<{
  ok: boolean;
  graceUntilMs: number;
  reason?: string;
}> {
  const rid = normalizeReceiverId(receiverId);
  const receiver = await Receiver.findById(rid)
    .select('isAvailable discoverGraceUntil')
    .lean<{ isAvailable?: boolean; discoverGraceUntil?: Date | null } | null>();
  if (!receiver?.isAvailable) {
    clearReceiverDiscoverGrace(rid);
    await syncReceiverPresenceInDatabase(rid);
    return { ok: false, graceUntilMs: 0, reason: 'isAvailable_false' };
  }

  const now = Date.now();
  const graceStillLive = isReceiverInDiscoverGrace(rid, receiver.discoverGraceUntil);
  const lastTouch = lastBackgroundPresenceTouchAt.get(rid) ?? 0;
  if (graceStillLive && now - lastTouch < BACKGROUND_PRESENCE_TOUCH_MIN_MS) {
    return { ok: true, graceUntilMs: currentGraceUntilMs(rid, receiver.discoverGraceUntil) };
  }

  lastBackgroundPresenceTouchAt.set(rid, now);
  const graceUntilMs = armReceiverDiscoverGraceImmediate(rid);
  await syncReceiverPresenceInDatabase(rid);
  return { ok: true, graceUntilMs };
}

/** App returned foreground with a live socket — drop grace so presence tracks the real connection. */
export async function touchReceiverForegroundPresence(receiverId: string): Promise<void> {
  const rid = normalizeReceiverId(receiverId);
  if (isReceiverSocketConnected(rid)) {
    clearReceiverDiscoverGrace(rid);
  }
  await syncReceiverPresenceInDatabase(rid);
}

/**
 * DB `isOnline` is Go Online (`isAvailable`) plus live socket or background grace.
 * Push tokens wake a ringing phone; they do not count as logged in for discover/admin.
 */
export async function syncReceiverPresenceInDatabase(receiverId: string): Promise<void> {
  const rid = normalizeReceiverId(receiverId);
  if (!rid) return;

  const receiver = await Receiver.findById(rid).select(
    'isAvailable onlineSince isOnline discoverGraceUntil'
  );
  if (!receiver) return;

  const socketLive = isReceiverSocketConnected(rid);
  const graceLive = isReceiverInDiscoverGrace(rid, receiver.discoverGraceUntil);
  const shouldBeOnline = Boolean(receiver.isAvailable) && (socketLive || graceLive);
  const wasOnline = Boolean(receiver.isOnline);
  const onlineSince = receiver.onlineSince;

  if (shouldBeOnline && !wasOnline) {
    receiver.isOnline = true;
    if (!(onlineSince instanceof Date)) {
      receiver.onlineSince = new Date();
    }
    await receiver.save();
    await syncReceiverQueueState(rid);
    return;
  }

  if (!shouldBeOnline && wasOnline) {
    receiver.isOnline = false;
    receiver.onlineSince = null;
    await receiver.save();
    if (onlineSince instanceof Date) {
      await finalizeReceiverOnlineSession({
        receiverId: rid,
        onlineSince,
        endedAt: new Date(),
      });
    }
    await syncReceiverQueueState(rid);
    return;
  }

  if (shouldBeOnline !== wasOnline) {
    receiver.isOnline = shouldBeOnline;
    await receiver.save();
  }
  await syncReceiverQueueState(rid);
}

/** Whether callers should treat this receiver as logged-in right now. */
export function isReceiverLoggedInForDiscover(
  receiverId: string,
  discoverGraceUntil?: Date | null
): boolean {
  return isReceiverDiscoverPresenceLive(receiverId, discoverGraceUntil);
}

/** Callable on discover: Go Online switch on (socket optional while app is backgrounded). */
export function isReceiverDiscoverAvailable(
  receiverId: string,
  isAvailableFlag: boolean
): boolean {
  return isAvailableFlag;
}
