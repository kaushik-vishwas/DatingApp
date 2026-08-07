import { Audio } from 'expo-av';
import { PermissionsAndroid, Platform } from 'react-native';

export type VoiceCallPermissionResult = {
  microphone: boolean;
  readPhoneState: boolean;
  bluetoothConnect: boolean;
};

let inFlight: Promise<VoiceCallPermissionResult> | null = null;

async function requestAndroidIfNeeded(permission: string): Promise<boolean> {
  try {
    const already = await PermissionsAndroid.check(permission);
    if (already) return true;
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Ask for all voice-call runtime permissions up front (mic + Android phone-state + BT).
 * Coalesces concurrent callers so the user sees one prompt sequence before dial/accept.
 * After grant, later calls only check — no mid-connect dialogs.
 */
export async function ensureVoiceCallPermissions(): Promise<VoiceCallPermissionResult> {
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<VoiceCallPermissionResult> => {
    let microphone = false;
    try {
      const existing = await Audio.getPermissionsAsync();
      if (existing.status === 'granted') {
        microphone = true;
      } else {
        const requested = await Audio.requestPermissionsAsync();
        microphone = requested.status === 'granted';
      }
    } catch {
      microphone = false;
    }

    let readPhoneState = Platform.OS !== 'android';
    let bluetoothConnect = true;

    if (Platform.OS === 'android') {
      const phonePerm = PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;
      const btPerm =
        Platform.Version >= 31 ? PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT : null;

      const [phoneOk, btOk] = await Promise.all([
        requestAndroidIfNeeded(phonePerm),
        btPerm ? requestAndroidIfNeeded(btPerm) : Promise.resolve(true),
      ]);
      readPhoneState = phoneOk;
      bluetoothConnect = btOk;
    }

    return { microphone, readPhoneState, bluetoothConnect };
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Fast check — never shows a system dialog. */
export async function hasVoiceCallMicrophonePermission(): Promise<boolean> {
  try {
    const existing = await Audio.getPermissionsAsync();
    return existing.status === 'granted';
  } catch {
    return false;
  }
}
