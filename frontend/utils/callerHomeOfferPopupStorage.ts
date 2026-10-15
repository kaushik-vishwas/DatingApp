import AsyncStorage from '@react-native-async-storage/async-storage';

/** Show the home recharge offer again only after this gap, including after the app was closed. */
export const CALLER_HOME_OFFER_POPUP_INTERVAL_MS = 2 * 60 * 60 * 1000;

function storageKey(userId: string): string {
  return `caller_home_offer_popup_at:${userId}`;
}

export async function shouldShowCallerHomeOfferPopup(userId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last) || last <= 0) return true;
    return Date.now() - last >= CALLER_HOME_OFFER_POPUP_INTERVAL_MS;
  } catch {
    return false;
  }
}

export async function markCallerHomeOfferPopupSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), String(Date.now()));
  } catch {
    // ignore
  }
}

/** Milliseconds until the offer may show again. 0 means it is due now. */
export async function msUntilCallerHomeOfferPopup(userId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return 0;
    const last = Number(raw);
    if (!Number.isFinite(last) || last <= 0) return 0;
    return Math.max(0, last + CALLER_HOME_OFFER_POPUP_INTERVAL_MS - Date.now());
  } catch {
    return CALLER_HOME_OFFER_POPUP_INTERVAL_MS;
  }
}

export function msUntilLocalMidnight(): number {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, end.getTime() - now.getTime());
}
