import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IncomingCallNotificationPayload } from './incomingCallNotifications';

const STORAGE_KEY = '@nestham_pending_incoming_call_tap_v1';
const SHOWN_STORAGE_KEY = '@nestham_shown_incoming_call_v1';
const MAX_AGE_MS = 5 * 60 * 1000;

export async function persistPendingIncomingCallTap(
  incoming: IncomingCallNotificationPayload
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...incoming,
        savedAt: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}

export async function readPendingIncomingCallTap(): Promise<IncomingCallNotificationPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    const callId = typeof row.callId === 'string' ? row.callId.trim() : '';
    if (!callId) return null;
    const savedAt = typeof row.savedAt === 'number' ? row.savedAt : 0;
    if (savedAt > 0 && Date.now() - savedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const fromType: 'u' | 'r' = row.fromType === 'r' ? 'r' : 'u';
    const fromId = typeof row.fromId === 'string' ? row.fromId.trim() : '';
    const peerName =
      typeof row.peerName === 'string' && row.peerName.trim() ? row.peerName.trim() : 'Caller';
    const peerImage =
      typeof row.peerImage === 'string'
        ? row.peerImage
        : row.peerImage === null
          ? null
          : undefined;
    return { callId, fromType, fromId, peerName, peerImage };
  } catch {
    return null;
  }
}

export async function clearPendingIncomingCallTap(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function persistShownIncomingCallNotification(
  incoming: IncomingCallNotificationPayload
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SHOWN_STORAGE_KEY,
      JSON.stringify({
        ...incoming,
        savedAt: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}

export async function readShownIncomingCallNotification(): Promise<IncomingCallNotificationPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(SHOWN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    const callId = typeof row.callId === 'string' ? row.callId.trim() : '';
    if (!callId) return null;
    const savedAt = typeof row.savedAt === 'number' ? row.savedAt : 0;
    if (savedAt > 0 && Date.now() - savedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(SHOWN_STORAGE_KEY);
      return null;
    }
    const fromType: 'u' | 'r' = row.fromType === 'r' ? 'r' : 'u';
    const fromId = typeof row.fromId === 'string' ? row.fromId.trim() : '';
    const peerName =
      typeof row.peerName === 'string' && row.peerName.trim() ? row.peerName.trim() : 'Caller';
    const peerImage =
      typeof row.peerImage === 'string'
        ? row.peerImage
        : row.peerImage === null
          ? null
          : undefined;
    return { callId, fromType, fromId, peerName, peerImage };
  } catch {
    return null;
  }
}

export async function clearShownIncomingCallNotification(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SHOWN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
