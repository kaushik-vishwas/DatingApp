import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { PermissionsAndroid, Platform } from 'react-native';
import IncomingCallAndroid from '../modules/incoming-call-android';

export type VoiceCallOutputRoute = 'speaker' | 'earpiece' | 'bluetooth';

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

  if (route === 'bluetooth') {
    const granted = await ensureBluetoothConnectPermission();
    if (!granted) {
      throw new Error('Bluetooth permission is required to route call audio');
    }
  }
  IncomingCallAndroid.setVoiceCallAudioRoute(route);
}

export async function isBluetoothVoiceOutputAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return IncomingCallAndroid.isBluetoothVoiceOutputAvailable();
  } catch {
    return false;
  }
}

export function releaseVoiceCallOutputRoute(): void {
  if (Platform.OS !== 'android') return;
  try {
    IncomingCallAndroid.releaseVoiceCallAudioRoute();
  } catch {
    // Native module may be unavailable in dev clients without a rebuild.
  }
}
