import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  isIncomingCallGoneError,
  useCallSignals,
  type IncomingCallRequest,
} from '../../context/CallSignalContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { resolveProfileImageSource } from '../../utils/avatarSource';
import { canNavigateToIncomingCall } from '../../utils/incomingCallNotifications';

type Props = NativeStackScreenProps<ReceiverStackParamList, 'IncomingCall'>;

/** Auto-answer once when the receiver is looking at the incoming UI. */
const AUTO_ACCEPT_MS = 15_000;

export default function IncomingCallScreen({ navigation, route }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { callId, fromType, fromId, peerName, peerImage } = route.params;
  const {
    acceptIncomingCall,
    rejectIncomingCall,
    stopIncomingRingtone,
    startIncomingRingtone,
    confirmIncomingCallSeenOnScreen,
  } = useCallSignals();

  const req: IncomingCallRequest = useMemo(
    () => ({ callId, fromType, fromId, peerName, peerImage: peerImage ?? null }),
    [callId, fromType, fromId, peerName, peerImage]
  );

  const peerAvatarSource = useMemo(() => resolveProfileImageSource(peerImage), [peerImage]);

  const [responding, setResponding] = useState(false);
  /** Which button was tapped — shows its spinner while the response is in flight. */
  const [respondingAction, setRespondingAction] = useState<'accept' | 'reject' | null>(null);
  const respondedRef = useRef(false);
  const acceptRef = useRef<() => void>(() => {});
  const rejectRef = useRef<() => void>(() => {});

  useEffect(() => {
    confirmIncomingCallSeenOnScreen(callId);
  }, [callId, confirmIncomingCallSeenOnScreen]);

  useFocusEffect(
    useCallback(() => {
      if (respondedRef.current) return;
      if (!canNavigateToIncomingCall(callId)) {
        if (navigation.canGoBack()) navigation.goBack();
      }
    }, [callId, navigation])
  );

  useEffect(() => {
    void (async () => {
      try {
        await startIncomingRingtone();
      } catch {
        // UI still works if ring fails.
      }
    })();
  }, [startIncomingRingtone]);

  // Warm the mic-permission cache + audio while ringing so Accept → join is immediate. Check only:
  // a system permission dialog here covers Accept/Reject (taps lost). Accept / the call screen
  // still request any missing permission before connecting.
  useEffect(() => {
    void (async () => {
      try {
        const { hasVoiceCallMicrophonePermission } = await import('../../utils/voiceCallPermissions');
        await hasVoiceCallMicrophonePermission();
      } catch {
        // Accept path still verifies microphone before connect.
      }
      try {
        const { applyVoiceCallOutputRoute } = await import('../../utils/voiceCallAudioRoute');
        await applyVoiceCallOutputRoute('speaker');
      } catch {
        // Join path applies audio mode again.
      }
    })();
  }, []);

  // "Ringtone-like" pulsing rings behind the avatar.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        // Native driver: keeps the JS thread free for taps during a busy cold start.
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
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

  const onReject = useCallback(async () => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    setResponding(true);
    setRespondingAction('reject');
    try {
      // Reject first (it also stops the ring) — never wait on audio before the caller is told.
      rejectIncomingCall(req);
      void stopIncomingRingtone();
    } finally {
      // Cold start from a notification deep link: IncomingCall is the only route, goBack is a no-op.
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.replace('ReceiverMainTabs', { screen: 'ReceiverHome' });
    }
  }, [navigation, rejectIncomingCall, req, stopIncomingRingtone]);

  const onAccept = useCallback(async () => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    setResponding(true);
    setRespondingAction('accept');
    try {
      void stopIncomingRingtone();
      await acceptIncomingCall(req);
    } catch (e) {
      if (isIncomingCallGoneError(e)) {
        // Invite ended on the server (caller gave up / no-answer before the tap landed): say so
        // instead of silently dropping the receiver on Home.
        Alert.alert('Call ended', 'The caller is no longer on the line.');
        // A socket `call:ended` may already have taken us Home.
        if (!navigation.isFocused()) return;
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('ReceiverMainTabs', { screen: 'ReceiverHome' } as never);
        return;
      }
      // Invite is still ringing (e.g. network / mic not ready): let the receiver tap Accept again.
      respondedRef.current = false;
      setResponding(false);
      setRespondingAction(null);
      Alert.alert(
        'Could not connect',
        e instanceof Error && e.message ? `${e.message}\n\nTap accept to try again.` : 'Tap accept to try again.'
      );
    }
  }, [acceptIncomingCall, navigation, req, stopIncomingRingtone]);

  acceptRef.current = () => {
    void onAccept();
  };
  rejectRef.current = () => {
    void onReject();
  };

  // Stable one-shot auto-pick: do not re-arm when callback identities change.
  useEffect(() => {
    const timeout = setTimeout(() => {
      // Skip when the invite was declined / answered / ended meanwhile (e.g. caller hung up while a
      // cold-start screen stayed mounted under Home) — no stale "Call ended" alert.
      if (!respondedRef.current && canNavigateToIncomingCall(callId)) {
        acceptRef.current();
      }
    }, AUTO_ACCEPT_MS);
    return () => clearTimeout(timeout);
  }, [callId]);

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

          {peerAvatarSource ? (
            <Image source={peerAvatarSource} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{peerInitial}</Text>
            </View>
          )}
        </View>

        <Text style={styles.ringingText}>{responding ? 'Connecting' : 'Incoming call'}</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn, responding && styles.actionBtnBusy]}
            onPress={() => void onReject()}
            disabled={responding}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Reject incoming call"
            accessibilityState={{ disabled: responding, busy: respondingAction === 'reject' }}
          >
            {respondingAction === 'reject' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="close" size={28} color="#fff" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn, responding && styles.actionBtnBusy]}
            onPress={() => void onAccept()}
            disabled={responding}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Accept incoming call"
            accessibilityState={{ disabled: responding, busy: respondingAction === 'accept' }}
          >
            {respondingAction === 'accept' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="checkmark" size={28} color="#fff" />
            )}
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
  actionBtnBusy: { opacity: 0.5 },
});
