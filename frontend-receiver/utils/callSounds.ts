import { Audio, type AVPlaybackStatusSuccess, type InterruptionModeAndroid, type InterruptionModeIOS } from 'expo-av';

const OUTGOING_BEEP_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';
const INCOMING_RING_URL = 'https://actions.google.com/sounds/v1/alarms/phone_alerts_and_rings.ogg';

let audioModePrepared = false;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureAudioMode(): Promise<void> {
  if (audioModePrepared) return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX as InterruptionModeIOS,
    interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX as InterruptionModeAndroid,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
  audioModePrepared = true;
}

export async function startOutgoingCallTone(): Promise<() => Promise<void>> {
  await ensureAudioMode();
  const sound = new Audio.Sound();
  await sound.loadAsync({ uri: OUTGOING_BEEP_URL }, { shouldPlay: false, isLooping: false, volume: 0.8 });

  let disposed = false;
  const onPlaybackStatusUpdate = (status: unknown) => {
    const s = status as AVPlaybackStatusSuccess;
    if (!disposed && s.isLoaded && s.didJustFinish) {
      // noop: cadence is controlled by timers.
    }
  };

  sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
  void (async () => {
    while (!disposed) {
      try {
        await sound.replayAsync();
      } catch {
        break;
      }
      await wait(320);
      if (disposed) break;
      try {
        await sound.replayAsync();
      } catch {
        break;
      }
      await wait(1700);
    }
  })();

  return async () => {
    disposed = true;
    try {
      await sound.stopAsync();
    } catch {
      // ignore
    }
    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
  };
}

export async function startIncomingRingtone(): Promise<() => Promise<void>> {
  await ensureAudioMode();
  const sound = new Audio.Sound();
  await sound.loadAsync(
    { uri: INCOMING_RING_URL },
    { shouldPlay: true, isLooping: true, volume: 1.0 }
  );

  return async () => {
    try {
      await sound.stopAsync();
    } catch {
      // ignore
    }
    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
  };
}
