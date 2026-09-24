import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  inferMimeFromLocalRecording,
  uploadToCloudinary,
  type CloudinaryUploadDebugEntry,
} from '../lib/cloudinary';

const PURPLE = '#7b2cff';

type Props = {
  scriptText: string;
  onUploadComplete: (url: string) => void;
  /** When true, parent renders the script (e.g. language tabs). */
  hideScript?: boolean;
  onUploadDebug?: (entry: CloudinaryUploadDebugEntry) => void;
  onUploadError?: (message: string) => void;
};

async function releaseRecording(rec: Audio.Recording | null): Promise<void> {
  if (!rec) return;
  try {
    await rec.stopAndUnloadAsync();
  } catch {
    // Already stopped / never started — nothing left to release.
  }
}

/**
 * expo-av allows one prepared Recording app-wide and only the Recording that set its internal
 * "recorder exists" flag can clear it. Kept at module level so a Recording orphaned by a remount
 * (screen left mid-prepare, Fast Refresh) is still released before the next attempt.
 */
let lastPreparedRecording: Audio.Recording | null = null;

async function releaseLastPreparedRecording(): Promise<void> {
  const rec = lastPreparedRecording;
  lastPreparedRecording = null;
  await releaseRecording(rec);
}

function isRecorderAlreadyPreparedError(e: unknown): boolean {
  return e instanceof Error && e.message.includes('Only one Recording object can be prepared');
}

/**
 * Last resort when the owning Recording is gone: clear expo-av's module-private flag through a
 * throwaway instance. Safe because native prepare already discards any previous recorder.
 */
function forceResetExpoAvRecorderFlag(): void {
  const dummy = new Audio.Recording() as unknown as {
    _cleanupForUnloadedRecorder?: (finalStatus?: unknown) => Promise<unknown>;
  };
  void dummy._cleanupForUnloadedRecorder?.().catch(() => {});
}

function useRecordingPulse(active: boolean): {
  ring1: Animated.Value;
  ring2: Animated.Value;
  hintOpacity: Animated.Value;
  breathe: Animated.Value;
} {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    loopsRef.current.forEach((a) => a.stop());
    loopsRef.current = [];
    ring1.setValue(0);
    ring2.setValue(0);
    hintOpacity.setValue(1);
    breathe.setValue(1);

    if (!active) return;

    const makeRing = (value: Animated.Value, delayMs: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(value, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const hintLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(hintOpacity, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(hintOpacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1.04,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const a1 = makeRing(ring1, 0);
    const a2 = makeRing(ring2, 550);
    loopsRef.current = [a1, a2, hintLoop, breatheLoop];
    a1.start();
    a2.start();
    hintLoop.start();
    breatheLoop.start();

    return () => {
      loopsRef.current.forEach((a) => a.stop());
      loopsRef.current = [];
    };
  }, [active, breathe, hintOpacity, ring1, ring2]);

  return { ring1, ring2, hintOpacity, breathe };
}

export default function VoiceVerificationRecorder({
  scriptText,
  onUploadComplete,
  hideScript = false,
  onUploadDebug,
  onUploadError,
}: Props): React.JSX.Element {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  /** Local file of the last recording whose upload failed — lets the user retry without re-recording. */
  const [failedUploadUri, setFailedUploadUri] = useState<string | null>(null);
  const { ring1, ring2, hintOpacity, breathe } = useRecordingPulse(isRecording && !busy);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingRef.current = null;
      void releaseLastPreparedRecording();
    };
  }, []);

  const debug = useCallback(
    (step: string, detail?: string) => {
      onUploadDebug?.({ at: new Date().toISOString(), step, detail });
    },
    [onUploadDebug]
  );

  const startRecording = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Voice verification requires the Android or iOS app.');
      return;
    }
    setStatusLine(null);
    setFailedUploadUri(null);
    setBusy(true);
    let rec: Audio.Recording | null = null;
    let stage = 'release_previous';
    debug('record_start', `${Platform.OS} ${String(Platform.Version)}`);
    try {
      // A recording left prepared by an earlier failure blocks every new one — release it first.
      await releaseRecording(recordingRef.current);
      recordingRef.current = null;
      await releaseLastPreparedRecording();

      stage = 'mic_permission';
      const perm = await Audio.requestPermissionsAsync();
      debug('mic_permission', `status=${perm.status} canAskAgain=${String(perm.canAskAgain)}`);
      if (perm.status !== 'granted') {
        Alert.alert('Permission', 'Microphone access is required to record your verification.');
        return;
      }

      stage = 'audio_mode';
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      debug('audio_mode_ok');

      stage = 'prepare';
      rec = new Audio.Recording();
      lastPreparedRecording = rec;
      try {
        await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      } catch (e) {
        if (!isRecorderAlreadyPreparedError(e)) throw e;
        // The Recording that owns expo-av's flag was lost — reset it and retry once.
        debug('prepare_recorder_flag_reset');
        forceResetExpoAvRecorderFlag();
        await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      }
      debug('prepare_ok');

      stage = 'start';
      await rec.startAsync();
      if (!mountedRef.current) {
        // Screen closed while preparing — don't leave the mic recording in the background.
        await releaseLastPreparedRecording();
        return;
      }
      recordingRef.current = rec;
      setIsRecording(true);
      debug('recording_started');
    } catch (e) {
      await releaseRecording(rec);
      if (lastPreparedRecording === rec) lastPreparedRecording = null;
      recordingRef.current = null;
      setIsRecording(false);
      const msg = e instanceof Error ? e.message : 'Could not start recording';
      debug('record_start_failed', `at ${stage}: ${msg}`);
      Alert.alert('Recording', `${msg}\n\nPlease tap the mic to try again.`);
    } finally {
      setBusy(false);
    }
  }, [debug]);

  const upload = useCallback(
    async (uri: string) => {
      setBusy(true);
      setStatusLine('Uploading…');
      try {
        const { secure_url } = await uploadToCloudinary(uri, {
          mimeType: inferMimeFromLocalRecording(uri),
          resourceType: 'auto',
          fileName: 'voice-verification.m4a',
          onDebug: onUploadDebug,
        });
        setFailedUploadUri(null);
        onUploadComplete(secure_url);
        setStatusLine('Voice sample ready. Continue below.');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        setFailedUploadUri(uri);
        onUploadError?.(msg);
        setStatusLine(`Upload failed: ${msg}`);
        Alert.alert('Voice upload failed', `${msg}\n\nTap "Retry upload" or record again.`);
      } finally {
        setBusy(false);
      }
    },
    [onUploadComplete, onUploadDebug, onUploadError]
  );

  const stopAndUpload = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    setBusy(true);
    setStatusLine(null);
    try {
      const status = await rec.getStatusAsync();
      debug('record_status', `durationMs=${status.durationMillis ?? '?'} isRecording=${String(status.isRecording)}`);
    } catch (e) {
      debug('record_status_failed', e instanceof Error ? e.message : String(e));
    }
    let stopError: unknown = null;
    try {
      await rec.stopAndUnloadAsync();
      debug('stop_ok');
    } catch (e) {
      // Android throws here for very short recordings — still release the recorder below.
      stopError = e;
      debug('stop_failed', e instanceof Error ? e.message : String(e));
    }
    // Always leave "recording" state, otherwise the mic stays stuck on "Tap to stop".
    recordingRef.current = null;
    if (lastPreparedRecording === rec) lastPreparedRecording = null;
    setIsRecording(false);
    void Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});

    const uri = rec.getURI();
    debug('file', uri ? `…${uri.slice(-60)}` : 'no uri');
    if (stopError || !uri) {
      setBusy(false);
      const msg =
        stopError instanceof Error && stopError.message
          ? stopError.message
          : 'No audio file was produced.';
      setStatusLine('Recording failed. Tap the mic to record again.');
      Alert.alert('Recording failed', `${msg}\n\nPlease record again and read the full paragraph.`);
      return;
    }
    await upload(uri);
  }, [debug, upload]);

  const onMicPress = () => {
    if (busy) return;
    if (isRecording) {
      void stopAndUpload();
    } else {
      void startRecording();
    }
  };

  const ringStyle = (progress: Animated.Value) => ({
    opacity: progress.interpolate({
      inputRange: [0, 0.2, 1],
      outputRange: [0.55, 0.3, 0],
    }),
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.72],
        }),
      },
    ],
  });

  const hint =
    busy && isRecording
      ? 'Saving…'
      : isRecording
        ? 'Tap to stop'
        : busy
          ? 'Please wait'
          : 'Tap to record';

  return (
    <View>
      {!hideScript ? (
        <View style={styles.scriptBox}>
          <Text style={styles.scriptText}>{scriptText}</Text>
        </View>
      ) : null}

      <View style={styles.micSection}>
        <View style={styles.micStage}>
          {isRecording ? (
            <>
              <Animated.View style={[styles.pulseRing, ringStyle(ring1)]} pointerEvents="none" />
              <Animated.View style={[styles.pulseRing, ringStyle(ring2)]} pointerEvents="none" />
            </>
          ) : null}

          <Animated.View style={isRecording ? { transform: [{ scale: breathe }] } : undefined}>
            <TouchableOpacity
              style={[styles.micCircle, isRecording && styles.micCircleLive]}
              onPress={onMicPress}
              activeOpacity={0.85}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={hint}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : isRecording ? (
                <View style={styles.stopGlyph} />
              ) : (
                <View style={styles.micGlyph}>
                  <View style={styles.micHead} />
                  <View style={styles.micStem} />
                  <View style={styles.micBase} />
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>

        {isRecording && !busy ? (
          <View style={styles.liveRow}>
            <Animated.View style={[styles.liveDot, { opacity: hintOpacity }]} />
            <Text style={styles.liveLabel}>Recording</Text>
          </View>
        ) : null}

        <Animated.Text
          style={[
            styles.micHint,
            isRecording && !busy ? { opacity: hintOpacity } : null,
            isRecording ? styles.micHintLive : null,
          ]}
        >
          {hint}
        </Animated.Text>

        {statusLine ? <Text style={styles.status}>{statusLine}</Text> : null}

        {failedUploadUri && !busy && !isRecording ? (
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void upload(failedUploadUri)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry upload</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const MIC_SIZE = 88;
/** Room for expanding rings (~1.72×) around the button. */
const STAGE_SIZE = Math.ceil(MIC_SIZE * 1.85);

const styles = StyleSheet.create({
  scriptBox: {
    backgroundColor: '#f8f8f9',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ececee',
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  scriptText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#333',
    textAlign: 'center',
  },
  micSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: STAGE_SIZE + 72,
  },
  micStage: {
    width: STAGE_SIZE,
    height: STAGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    borderWidth: 2,
    borderColor: PURPLE,
    backgroundColor: 'rgba(123, 44, 255, 0.12)',
  },
  micCircle: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  micCircleLive: {
    backgroundColor: '#111',
  },
  /** Minimal mic icon (no emoji). */
  micGlyph: {
    width: 22,
    height: 32,
    alignItems: 'center',
  },
  micHead: {
    width: 14,
    height: 20,
    borderRadius: 7,
    backgroundColor: '#fff',
  },
  micStem: {
    width: 2,
    height: 6,
    backgroundColor: '#fff',
    marginTop: 1,
  },
  micBase: {
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
  },
  /** Minimal stop square while recording. */
  stopGlyph: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  liveLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#9ca3af',
  },
  micHint: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.2,
  },
  micHintLive: {
    marginTop: 8,
    color: '#111',
    fontWeight: '500',
  },
  status: {
    marginTop: 14,
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  retryBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: PURPLE,
  },
  retryText: {
    color: PURPLE,
    fontSize: 14,
    fontWeight: '700',
  },
});
