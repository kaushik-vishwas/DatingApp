import { Platform } from 'react-native';
import * as Device from 'expo-device';

export type SamsungCallCompatProfile = {
  isSamsung: boolean;
  oneUiVersion: number;
  isSamsungOneUi6OrNewer: boolean;
  sdkInt: number;
  manufacturer: string;
  model: string;
};

let cachedProfile: SamsungCallCompatProfile | null = null;

function readNativeProfile(): SamsungCallCompatProfile | null {
  if (Platform.OS !== 'android') return null;
  try {
    const mod = require('incoming-call-android').default as {
      getSamsungCallCompatProfile?: () => SamsungCallCompatProfile;
    };
    if (typeof mod.getSamsungCallCompatProfile !== 'function') return null;
    const raw = mod.getSamsungCallCompatProfile();
    if (!raw || typeof raw !== 'object') return null;
    return {
      isSamsung: Boolean(raw.isSamsung),
      oneUiVersion: Number(raw.oneUiVersion) || 0,
      isSamsungOneUi6OrNewer: Boolean(raw.isSamsungOneUi6OrNewer),
      sdkInt: Number(raw.sdkInt) || 0,
      manufacturer: String(raw.manufacturer ?? ''),
      model: String(raw.model ?? ''),
    };
  } catch {
    return null;
  }
}

function readJsFallbackProfile(): SamsungCallCompatProfile {
  const brand = (Device.brand ?? '').toLowerCase();
  const isSamsung = brand === 'samsung';
  const sdkInt =
    Platform.OS === 'android' && typeof Platform.Version === 'number'
      ? Platform.Version
      : Number(Platform.Version) || 0;
  return {
    isSamsung,
    oneUiVersion: 0,
    isSamsungOneUi6OrNewer: isSamsung && sdkInt >= 34,
    sdkInt,
    manufacturer: Device.manufacturer ?? brand,
    model: Device.modelName ?? '',
  };
}

export function getSamsungCallCompatProfile(): SamsungCallCompatProfile {
  if (cachedProfile) return cachedProfile;
  cachedProfile = readNativeProfile() ?? readJsFallbackProfile();
  return cachedProfile;
}

export function isSamsungOneUi6OrNewer(): boolean {
  return getSamsungCallCompatProfile().isSamsungOneUi6OrNewer;
}

/** Longer debounce while peer may be on GSM hold (Samsung drops Stream participants transiently). */
export function getHoldRemoteLeftDebounceMs(): number {
  return isSamsungOneUi6OrNewer() ? 90_000 : 30_000;
}

export function getNormalRemoteLeftDebounceMs(): number {
  if (Platform.OS === 'android') {
    // Stream can drop ~500ms before cellular audio mode flips — allow time for hold signal.
    return isSamsungOneUi6OrNewer() ? 2_500 : 2_000;
  }
  return 500;
}

/** While talk is active on Android, a missing remote participant may be GSM hold — wait longer. */
export function getAndroidTalkGsmSuspectDebounceMs(): number {
  return isSamsungOneUi6OrNewer() ? 6_000 : 5_000;
}

/** Max time to wait for Stream leave/disconnect during GSM before forcing UI exit. */
export const SAMSUNG_GSM_TEARDOWN_TIMEOUT_MS = 5_000;

/** If hangup is blocked by a stuck ending flag, force-reset after this delay. */
export const STUCK_CALL_END_RESET_MS = 4_000;
