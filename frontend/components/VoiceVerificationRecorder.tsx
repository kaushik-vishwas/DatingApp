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
  const { ring1, ring2, hintOpacity, breathe } = useRecordingPulse(isRecording && !busy);

  useEffect(() => {
    return () => {
      void (async () => {
        const r = recordingRef.current;
        if (r) {
          try {
            await r.stopAndUnloadAsync();
          } catch {
            /* ignore */
          }
          recordingRef.current = null;
        }
      })();
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Voice verification requires the Android or iOS app.');
      return;
    }
    setStatusLine(null);
    setBusy(true);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission', 'Microphone access is required to record your verification.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start recording';
      Alert.alert('Recording', msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const stopAndUpload = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    setBusy(true);
    setStatusLine(null);
    try {
      await rec.stopAndUnloadAsync();
      recordingRef.current = null;
      setIsRecording(false);
      const uri = rec.getURI();
      if (!uri) {
        Alert.alert('Recording', 'No audio file was produced. Try again.');
        return;
      }
      const mimeType = inferMimeFromLocalRecording(uri);
      setStatusLine('Uploading…');
      const { secure_url } = await uploadToCloudinary(uri, {
        mimeType,
        resourceType: 'auto',
        fileName: 'voice-verification.m4a',
        onDebug: onUploadDebug,
      });
      onUploadComplete(secure_url);
      setStatusLine('Voice sample ready. Continue below.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      onUploadError?.(msg);
      setStatusLine(`Failed: ${msg}`);
      Alert.alert('Voice upload failed', msg);
    } finally {
      setBusy(false);
    }
  }, [onUploadComplete, onUploadDebug, onUploadError]);

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
      inputRange: [0, 0.15, 1],
      outputRange: [0.45, 0.28, 0],
    }),
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.55],
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
      </View>
    </View>
  );
}

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
    minHeight: 200,
  },
  pulseRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: PURPLE,
  },
  micCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 18,
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
});
