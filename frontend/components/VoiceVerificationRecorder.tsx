import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
      setStatusLine('Uploading to Cloudinary…');
      const { secure_url } = await uploadToCloudinary(uri, {
        mimeType,
        resourceType: 'auto',
        fileName: 'voice-verification.m4a',
        onDebug: onUploadDebug,
      });
      onUploadComplete(secure_url);
      setStatusLine('Voice sample uploaded. You can continue.');
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
            <View style={[styles.pulseRing, styles.ringOuter]} />
            <View style={[styles.pulseRing, styles.ringInner]} />
          </>
        ) : null}
        <TouchableOpacity
          style={[styles.micCircle, isRecording && styles.micCircleLive]}
          onPress={onMicPress}
          activeOpacity={0.9}
          disabled={busy}
        >
          {busy && !isRecording ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.micIcon}>🎤</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.micHint}>
          {busy && isRecording ? 'Saving…' : isRecording ? 'Tap to stop & upload' : 'Tap to record'}
        </Text>
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
    minHeight: 180,
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: PURPLE,
    borderRadius: 999,
    opacity: 0.35,
  },
  ringOuter: { width: 140, height: 140 },
  ringInner: { width: 118, height: 118 },
  micCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCircleLive: { backgroundColor: '#6a24df' },
  micIcon: { fontSize: 36 },
  micHint: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#444',
  },
  status: {
    marginTop: 12,
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
