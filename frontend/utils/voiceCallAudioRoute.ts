import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { PermissionsAndroid, Platform } from 'react-native';
import type { IncomingCallAndroidModule } from '../modules/incoming-call-android';

export type VoiceCallOutputRoute = 'speaker' | 'earpiece' | 'bluetooth';

let nativeModule: IncomingCallAndroidModule | null | undefined;

function getIncomingCallAndroidModule(): IncomingCallAndroidModule | null {
  if (Platform.OS !== 'android') return null;
  if (nativeModule !== undefined) return nativeModule;
  try {
    nativeModule = require('incoming-call-android').default as IncomingCallAndroidModule;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

async function ensureBluetoothConnectPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 31) return true;
  const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) return true;
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function applyVoiceCallOutputRoute(route: VoiceCallOutputRoute): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: route === 'earpiece',
  });

  if (Platform.OS !== 'android') return;

  const mod = getIncomingCallAndroidModule();
  if (!mod) return;

  if (route === 'bluetooth') {
    const granted = await ensureBluetoothConnectPermission();
    if (!granted) {
      throw new Error('Bluetooth permission is required to route call audio');
    }
  }

  try {
    mod.setVoiceCallAudioRoute(route);
  } catch {
    // Native module unavailable until a dev build / release APK is installed.
  }
}

export async function isBluetoothVoiceOutputAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const mod = getIncomingCallAndroidModule();
  if (!mod) return false;
  try {
    return mod.isBluetoothVoiceOutputAvailable();
  } catch {
    return false;
  }
}

export function releaseVoiceCallOutputRoute(): void {
  if (Platform.OS !== 'android') return;
  const mod = getIncomingCallAndroidModule();
  if (!mod) return;
  try {
    mod.releaseVoiceCallAudioRoute();
  } catch {
    // Native module may be unavailable in Expo Go or before rebuild.
  }
}
