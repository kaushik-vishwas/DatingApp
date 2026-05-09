import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCallSignals, type IncomingCallRequest } from '../../context/CallSignalContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { startIncomingRingtone } from '../../utils/callSounds';

type Props = NativeStackScreenProps<ReceiverStackParamList, 'IncomingCall'>;

const INCOMING_CALL_UI_TIMEOUT_MS = 35_000;
const AUTO_ACCEPT_MS = 5_000;

export default function IncomingCallScreen({ navigation, route }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { callId, fromType, fromId, peerName, peerImage } = route.params;
  const { acceptIncomingCall, rejectIncomingCall } = useCallSignals();

  const req: IncomingCallRequest = useMemo(
    () => ({ callId, fromType, fromId, peerName, peerImage: peerImage ?? null }),
    [callId, fromType, fromId, peerName, peerImage]
  );

  const [responding, setResponding] = useState(false);
  const respondedRef = useRef(false);
  const stopRingtoneRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const stop = await startIncomingRingtone();
        if (!mounted) {
          await stop();
          return;
        }
        stopRingtoneRef.current = stop;
      } catch {
        // Keep the incoming-call UI even if ringtone could not be played.
      }
    })();
    return () => {
      mounted = false;
      const stop = stopRingtoneRef.current;
      stopRingtoneRef.current = null;
      if (stop) {
        void stop();
      }
    };
  }, []);

  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(INCOMING_CALL_UI_TIMEOUT_MS / 1000));

  // "Ringtone-like" pulsing rings behind the avatar.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    pulseAnim.start();
    return () => {
      pulseAnim.stop();
    };
  }, [pulse]);

  const ring1Opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0], extrapolate: 'clamp' });
  const ring1Scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.15], extrapolate: 'clamp' });
  const ring2Opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0], extrapolate: 'clamp' });
  const ring2Scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.2], extrapolate: 'clamp' });

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();
    interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, INCOMING_CALL_UI_TIMEOUT_MS - elapsed);
      setSecondsLeft(Math.ceil(remaining / 1000));
    }, 250);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const onReject = async () => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    setResponding(true);
    try {
      const stop = stopRingtoneRef.current;
      stopRingtoneRef.current = null;
      if (stop) {
        await stop();
      }
      rejectIncomingCall(req);
    } finally {
      navigation.goBack();
    }
  };

  const onAccept = async () => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    setResponding(true);
    try {
      const stop = stopRingtoneRef.current;
      stopRingtoneRef.current = null;
      if (stop) {
        await stop();
      }
      await acceptIncomingCall(req);
    } catch {
      setResponding(false);
      respondedRef.current = false;
    }
  };

  // Auto-decline if the receiver does not respond.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!responding && !respondedRef.current) {
        void onReject();
      }
    }, INCOMING_CALL_UI_TIMEOUT_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responding]);

  // Auto-accept if receiver does not act within 5 seconds.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!responding && !respondedRef.current) {
        void onAccept();
      }
    }, AUTO_ACCEPT_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responding]);

  const peerInitial = (peerName || 'U').trim().charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top + 12, 24) }]}>
      <Text style={styles.title}>Incoming call</Text>
      <Text style={styles.subtitle}>{peerName}</Text>

      <View style={styles.centerCard}>
        <View style={styles.avatarStage}>
          <Animated.View pointerEvents="none" style={[styles.ring, styles.ringRed, { opacity: ring1Opacity, transform: [{ scale: ring1Scale }] }]} />
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, styles.ringGreen, { opacity: ring2Opacity, transform: [{ scale: ring2Scale }] }]}
          />

          {peerImage ? (
            <Image source={{ uri: peerImage }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{peerInitial}</Text>
            </View>
          )}
        </View>

        <Text style={styles.ringingText}>{responding ? 'Please wait…' : `Ringing… ${secondsLeft}s`}</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => void onReject()}
            disabled={responding}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Reject incoming call"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={() => void onAccept()}
            disabled={responding}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Accept incoming call"
          >
            <Ionicons name="checkmark" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', paddingHorizontal: 18, justifyContent: 'flex-start' },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#c7f9ff', fontSize: 16, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  centerCard: { marginTop: 20, alignItems: 'center' },
  avatarStage: { width: 220, height: 220, justifyContent: 'center', alignItems: 'center' },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#fff', fontSize: 42, fontWeight: '900' },
  ring: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 4,
  },
  ringRed: { borderColor: '#ff3048' },
  ringGreen: { borderColor: '#2ad07f' },
  ringingText: { color: '#d1d5db', fontSize: 14, fontWeight: '700', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 22, marginTop: 18 },
  actionBtn: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { backgroundColor: '#ff3048' },
  acceptBtn: { backgroundColor: '#2ad07f' },
});

