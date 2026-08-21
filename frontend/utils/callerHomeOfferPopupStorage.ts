import AsyncStorage from '@react-native-async-storage/async-storage';

function localDayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function storageKey(userId: string, offerId: string): string {
  return `caller_home_offer_popup:${userId}:${offerId}:${localDayKey()}`;
}

export async function shouldShowCallerHomeOfferPopup(opts: {
  userId: string;
  offerId: string;
  forceFromLogin: boolean;
}): Promise<boolean> {
  if (opts.forceFromLogin) return true;
  const seen = await AsyncStorage.getItem(storageKey(opts.userId, opts.offerId));
  return seen !== '1';
}

export async function markCallerHomeOfferPopupSeen(userId: string, offerId: string): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId, offerId), '1');
}

export function msUntilLocalMidnight(): number {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, end.getTime() - now.getTime());
}
