import Constants from 'expo-constants';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const CAPTURE_KEY = 'voice_call';

function parseEnvBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return defaultValue;
}

/**
 * Toggle call-screen screenshot / screen-recording protection.
 * Set `EXPO_PUBLIC_CALL_SCREEN_CAPTURE_PROTECTION=true` in frontend/.env to block capture.
 * Default: false (screen recording allowed on call screen).
 */
export function isCallScreenCaptureProtectionEnabled(): boolean {
  const fromEnv = process.env.EXPO_PUBLIC_CALL_SCREEN_CAPTURE_PROTECTION;
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return parseEnvBool(fromEnv, false);
  }

  const extra = Constants.expoConfig?.extra?.callScreenCaptureProtection;
  if (typeof extra === 'boolean') return extra;
  if (typeof extra === 'string') return parseEnvBool(extra, false);

  return false;
}

/** Blocks screenshots and screen recording while `active` is true (Android + iOS). */
export function useCallScreenCaptureProtection(active: boolean): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    if (!isCallScreenCaptureProtectionEnabled()) {
      void ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY).catch(() => {});
      return;
    }

    if (!active) return;

    void ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY).catch(() => {});

    return () => {
      void ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY).catch(() => {});
    };
  }, [active]);
}
