import { Audio, InterruptionModeAndroid, InterruptionModeIOS, type AVPlaybackStatusSuccess } from 'expo-av';

/** Local ringtone — add `assets/sounds/receiver_ringtone.mp3` to this project. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RECEIVER_RINGTONE = require('../assets/sounds/receiver_ringtone.mp3') as number;

const OUTGOING_BEEP_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';
/** Random-match search uses the same asset as outgoing beeps, softer volume & slower cadence. */

let audioModePrepared = false;

/** One shared incoming ring sound (preloaded) so the next ring can start immediately. */
let incomingRingSound: Audio.Sound | null = null;
let incomingRingLoadPromise: Promise<void> | null = null;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureAudioMode(): Promise<void> {
  if (audioModePrepared) return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
  audioModePrepared = true;
}

/** Preload incoming ring (call while receiver socket is connected) so playback starts with no load delay. */
export async function ensureIncomingRingtoneLoaded(): Promise<void> {
  if (incomingRingSound) return;
  if (!incomingRingLoadPromise) {
    incomingRingLoadPromise = (async () => {
      await ensureAudioMode();
      const s = new Audio.Sound();
      await s.loadAsync(
        RECEIVER_RINGTONE,
        { shouldPlay: false, isLooping: true, volume: 1.0 }
      );
      incomingRingSound = s;
    })();
  }
  await incomingRingLoadPromise;
}

/** Stop the shared incoming ring (safe to call repeatedly). */
export async function stopIncomingRingtonePlayback(): Promise<void> {
  if (!incomingRingSound) return;
  try {
    await incomingRingSound.stopAsync();
  } catch {
    // ignore
  }
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

/**
 * Lightweight repeating sound while the random-match overlay is visible (finding + ringing).
 */
export async function startRandomMatchingTone(): Promise<() => Promise<void>> {
  await ensureAudioMode();
  const sound = new Audio.Sound();
  await sound.loadAsync({ uri: OUTGOING_BEEP_URL }, { shouldPlay: false, isLooping: false, volume: 0.38 });

  let disposed = false;
  void (async () => {
    while (!disposed) {
      try {
        await sound.replayAsync();
      } catch {
        break;
      }
      await wait(950);
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

/**
 * Start looping incoming ring using the preloaded sound when possible.
 * Returns the same stop function as `stopIncomingRingtonePlayback` for API compatibility.
 */
export async function startIncomingRingtone(): Promise<() => Promise<void>> {
  await ensureIncomingRingtoneLoaded();
  const sound = incomingRingSound!;
  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // ignore
  }
  return stopIncomingRingtonePlayback;
}

/** Looping phone-style ring while the caller waits for the receiver to answer. */
export async function startOutboundRingtoneLoop(): Promise<() => Promise<void>> {
  await ensureAudioMode();
  const sound = new Audio.Sound();
  await sound.loadAsync(
    RECEIVER_RINGTONE,
    { shouldPlay: true, isLooping: true, volume: 0.92 }
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
