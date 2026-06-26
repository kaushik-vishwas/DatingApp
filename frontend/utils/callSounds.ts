import { Audio, InterruptionModeAndroid, InterruptionModeIOS, type AVPlaybackStatusSuccess } from 'expo-av';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CALLER_RINGTONE = require('../assets/sounds/caller_ringtone.mp3') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RECEIVER_RINGTONE = require('../assets/sounds/receiver_ringtone.mp3') as number;

const OUTGOING_BEEP_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

let audioModePrepared = false;
let incomingRingBackgroundAudio = false;

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

/** Incoming ring must play when the app is minimized (socket still alive). */
async function ensureIncomingRingtoneAudioMode(): Promise<void> {
  if (incomingRingBackgroundAudio) return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
  });
  incomingRingBackgroundAudio = true;
}

async function releaseIncomingRingtoneAudioMode(): Promise<void> {
  if (!incomingRingBackgroundAudio) return;
  incomingRingBackgroundAudio = false;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // ignore
  }
}

/** Preload incoming ring (receiver) so playback starts with no load delay. */
export async function ensureIncomingRingtoneLoaded(): Promise<void> {
  if (incomingRingSound) return;
  if (!incomingRingLoadPromise) {
    incomingRingLoadPromise = (async () => {
      await ensureIncomingRingtoneAudioMode();
      const s = new Audio.Sound();
      await s.loadAsync(RECEIVER_RINGTONE, { shouldPlay: false, isLooping: true, volume: 1.0 });
      incomingRingSound = s;
    })();
  }
  await incomingRingLoadPromise;
}

/** Stop the shared incoming ring (safe to call repeatedly). */
export async function stopIncomingRingtonePlayback(): Promise<void> {
  if (!incomingRingSound) {
    await releaseIncomingRingtoneAudioMode();
    return;
  }
  try {
    await incomingRingSound.stopAsync();
  } catch {
    // ignore
  }
  await releaseIncomingRingtoneAudioMode();
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

/** Start looping incoming ring without restarting if already playing (tap handoff). */
export async function ensureIncomingRingtonePlaying(): Promise<() => Promise<void>> {
  await ensureIncomingRingtoneAudioMode();
  await ensureIncomingRingtoneLoaded();
  const sound = incomingRingSound!;
  try {
    const status = await sound.getStatusAsync();
    if (status.isLoaded && status.isPlaying) {
      return stopIncomingRingtonePlayback;
    }
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // ignore
  }
  return stopIncomingRingtonePlayback;
}

/** Start looping incoming ring (receiver) from the beginning. */
export async function startIncomingRingtone(): Promise<() => Promise<void>> {
  await ensureIncomingRingtoneAudioMode();
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

let activeOutboundRingtoneStop: (() => Promise<void>) | null = null;

/** Stop outbound ringtone immediately (e.g. caller cancelled while ringing). */
export async function stopOutboundRingtonePlayback(): Promise<void> {
  const stop = activeOutboundRingtoneStop;
  activeOutboundRingtoneStop = null;
  if (stop) {
    await stop();
  }
}

/** Looping phone-style ring while the caller waits for the receiver to answer. */
export async function startOutboundRingtoneLoop(): Promise<() => Promise<void>> {
  await stopOutboundRingtonePlayback();
  await ensureAudioMode();
  const sound = new Audio.Sound();
  await sound.loadAsync(CALLER_RINGTONE, { shouldPlay: true, isLooping: true, volume: 0.92 });

  const stop = async () => {
    if (activeOutboundRingtoneStop === stop) {
      activeOutboundRingtoneStop = null;
    }
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
  activeOutboundRingtoneStop = stop;
  return stop;
}
