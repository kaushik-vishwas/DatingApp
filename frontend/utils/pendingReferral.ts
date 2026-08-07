import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

const PENDING_KEY = '@selecto/pending_referral_code_v1';
const CAPTURE_DONE_KEY = '@selecto/referral_capture_attempted_v1';

/** Matches invite landing + backend referral code format. */
export function looksLikeReferralCode(value: string): boolean {
  return /^[A-Za-z0-9]{6,12}$/.test(value.trim());
}

export function normalizeReferralCode(value: unknown): string | null {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase();
  return looksLikeReferralCode(raw) ? raw : null;
}

export async function getPendingReferralCode(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return normalizeReferralCode(raw);
  } catch {
    return null;
  }
}

export async function setPendingReferralCode(code: string): Promise<void> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  try {
    await AsyncStorage.setItem(PENDING_KEY, normalized);
  } catch {
    // ignore
  }
}

export async function clearPendingReferralCode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/** Extract invite code from deep links like nestham://invite/ABC123 */
export function parseReferralCodeFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const trimmed = url.trim();
    const inviteMatch = trimmed.match(/invite\/([A-Za-z0-9]{6,12})/i);
    if (inviteMatch?.[1]) return normalizeReferralCode(inviteMatch[1]);

    const qIndex = trimmed.indexOf('?');
    if (qIndex >= 0) {
      const params = new URLSearchParams(trimmed.slice(qIndex + 1));
      for (const key of ['code', 'ref', 'referral', 'referral_code', 'utm_content']) {
        const hit = normalizeReferralCode(params.get(key));
        if (hit) return hit;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** Parse Play Install Referrer payload (ref= / utm_content= / plain code). */
export function parseReferralCodeFromInstallReferrer(referrer: string | null | undefined): string | null {
  if (!referrer || typeof referrer !== 'string') return null;
  const raw = referrer.trim();
  if (!raw) return null;

  const direct = normalizeReferralCode(raw);
  if (direct) return direct;

  try {
    const decoded = decodeURIComponent(raw);
    const params = new URLSearchParams(decoded.includes('=') ? decoded : `ref=${decoded}`);
    for (const key of ['ref', 'referral', 'referral_code', 'code', 'utm_content']) {
      const hit = normalizeReferralCode(params.get(key));
      if (hit) return hit;
    }
    for (const value of params.values()) {
      const hit = normalizeReferralCode(value);
      if (hit) return hit;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Silently capture invite code from deep link / Play install referrer / clipboard.
 * Native modules are loaded lazily so a missing module never crashes app start.
 */
export async function capturePendingReferralSilently(): Promise<void> {
  try {
    const existing = await getPendingReferralCode();
    if (existing) return;

    try {
      const initialUrl = await Linking.getInitialURL();
      const fromUrl = parseReferralCodeFromUrl(initialUrl);
      if (fromUrl) {
        await setPendingReferralCode(fromUrl);
        return;
      }
    } catch {
      // ignore
    }

    let alreadyTried = false;
    try {
      alreadyTried = (await AsyncStorage.getItem(CAPTURE_DONE_KEY)) === '1';
    } catch {
      alreadyTried = false;
    }

    if (Platform.OS === 'android') {
      try {
        const Application = await import('expo-application');
        const referrer = await Application.getInstallReferrerAsync();
        const fromReferrer = parseReferralCodeFromInstallReferrer(referrer);
        if (fromReferrer) {
          await setPendingReferralCode(fromReferrer);
          await AsyncStorage.setItem(CAPTURE_DONE_KEY, '1');
          return;
        }
      } catch {
        // Sideloaded APK / emulator / no Play Store — expected
      }
    }

    if (!alreadyTried) {
      try {
        const Clipboard = await import('expo-clipboard');
        const clip = await Clipboard.getStringAsync();
        const fromClip = normalizeReferralCode(clip);
        if (fromClip) {
          await setPendingReferralCode(fromClip);
        }
      } catch {
        // ignore
      }
      try {
        await AsyncStorage.setItem(CAPTURE_DONE_KEY, '1');
      } catch {
        // ignore
      }
    }
  } catch {
    // never block app start
  }
}

export function subscribeReferralDeepLinks(): () => void {
  try {
    const sub = Linking.addEventListener('url', (event) => {
      const code = parseReferralCodeFromUrl(event.url);
      if (code) void setPendingReferralCode(code);
    });
    return () => {
      try {
        sub.remove();
      } catch {
        // ignore
      }
    };
  } catch {
    return () => {};
  }
}
