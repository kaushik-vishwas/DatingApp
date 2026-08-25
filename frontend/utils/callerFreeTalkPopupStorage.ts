import AsyncStorage from '@react-native-async-storage/async-storage';

const FREE_TALK_POPUP_KEY_PREFIX = '@selecto/caller_free_talk_popup_v1:';
const FREE_TALK_ELIGIBLE_KEY_PREFIX = '@selecto/caller_free_talk_eligible_v1:';
/** Re-show free-talk offer at most once per hour. */
export const CALLER_FREE_TALK_POPUP_INTERVAL_MS = 60 * 60 * 1000;

export const CALLER_FREE_TALK_MINUTES = 2;

function popupKey(userId: string): string {
  return `${FREE_TALK_POPUP_KEY_PREFIX}${userId}`;
}

function eligibleKey(userId: string): string {
  return `${FREE_TALK_ELIGIBLE_KEY_PREFIX}${userId}`;
}

/** Mark caller as eligible after successful signup with welcome free-talk credit. */
export async function markCallerFreeTalkEligible(userId: string): Promise<void> {
  const id = String(userId ?? '').trim();
  if (!id) return;
  try {
    await AsyncStorage.setItem(eligibleKey(id), '1');
  } catch {
    // ignore
  }
}

export async function isCallerFreeTalkEligible(userId: string): Promise<boolean> {
  const id = String(userId ?? '').trim();
  if (!id) return false;
  try {
    return (await AsyncStorage.getItem(eligibleKey(id))) === '1';
  } catch {
    return false;
  }
}

export async function shouldShowCallerFreeTalkPopup(userId: string): Promise<boolean> {
  const id = String(userId ?? '').trim();
  if (!id) return false;
  try {
    if (!(await isCallerFreeTalkEligible(id))) return false;
    const raw = await AsyncStorage.getItem(popupKey(id));
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last) || last <= 0) return true;
    return Date.now() - last >= CALLER_FREE_TALK_POPUP_INTERVAL_MS;
  } catch {
    return false;
  }
}

export async function markCallerFreeTalkPopupShown(userId: string): Promise<void> {
  const id = String(userId ?? '').trim();
  if (!id) return;
  try {
    await AsyncStorage.setItem(popupKey(id), String(Date.now()));
  } catch {
    // ignore
  }
}
