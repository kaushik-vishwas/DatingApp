import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import type { VoiceCallScreenParams } from '../../navigation/voiceCallParams';
import type { VoiceBootstrapResponse } from '../../types/api';
import { useCallSignals } from '../../context/CallSignalContext';
import { useAuth } from '../../context/AuthContext';
import { callApi, getErrorMessage, getJwt, getResolvedApiBaseUrl } from '../../services/api';
import { startOutboundRingtoneLoop } from '../../utils/callSounds';
import { profileImageUrlForStreamOrNetwork, resolveProfileImageSource } from '../../utils/avatarSource';

type Props =
  | NativeStackScreenProps<CallerStackParamList, 'VoiceCall'>
  | NativeStackScreenProps<ReceiverStackParamList, 'VoiceCall'>;

async function applyVoiceCallAudioMode(speaker: boolean): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: !speaker,
  });
}

async function resetVoiceCallAudioMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // ignore
  }
}

function AvatarSoundWaveRings(): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.38] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0.55, 0.2, 0] });

  return (
    <View style={waveStyles.halo} pointerEvents="none">
      <Animated.View style={[waveStyles.ring, { transform: [{ scale }], opacity }]} />
      <Animated.View
        style={[
          waveStyles.ring,
          waveStyles.ringDelay,
          {
            transform: [
              {
                scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.52] }),
              },
            ],
            opacity: pulse.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.4, 0.12, 0] }),
          },
        ]}
      />
    </View>
  );
}

const waveStyles = StyleSheet.create({
  halo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: 'rgba(196, 181, 253, 0.65)',
  },
  ringDelay: {
    borderColor: 'rgba(167, 139, 250, 0.45)',
  },
});

function getOutgoingCallerPhase(params: VoiceCallScreenParams): 'ringing' | 'joining' | undefined {
  if ('outgoingCallerPhase' in params && params.outgoingCallerPhase) {
    return params.outgoingCallerPhase;
  }
  return undefined;
}

function getVoiceBootstrap(params: VoiceCallScreenParams): VoiceBootstrapResponse | null {
  if ('apiKey' in params && typeof params.apiKey === 'string' && params.apiKey.length > 0) {
    return params as VoiceBootstrapResponse;
  }
  return null;
}

function getReceiverChargeRatePerMinute(params: VoiceCallScreenParams): number {
  if ('receiverRatePerMinute' in params && typeof params.receiverRatePerMinute === 'number') {
    return Math.max(0, params.receiverRatePerMinute);
  }
  if ('receiverRatePerMinuteHint' in params && typeof params.receiverRatePerMinuteHint === 'number') {
    return Math.max(0, params.receiverRatePerMinuteHint);
  }
  return 0;
}

function getReceiverEarnRatePerMinute(params: VoiceCallScreenParams): number {
  if (
    'receiverEarningRatePerMinute' in params &&
    typeof params.receiverEarningRatePerMinute === 'number' &&
    Number.isFinite(params.receiverEarningRatePerMinute)
  ) {
    return Math.max(0, params.receiverEarningRatePerMinute);
  }
  if (
    'receiverEarningRatePerMinuteHint' in params &&
    typeof params.receiverEarningRatePerMinuteHint === 'number' &&
    Number.isFinite(params.receiverEarningRatePerMinuteHint)
  ) {
    return Math.max(0, params.receiverEarningRatePerMinuteHint);
  }
  return 0;
}

export default function VoiceCallScreen({ navigation, route }: Props): React.JSX.Element {
  const MIN_RATING_SECONDS = 60;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { cancelOutgoingCallInvite } = useCallSignals();
  const cancelOutgoingRef = useRef(cancelOutgoingCallInvite);
  cancelOutgoingRef.current = cancelOutgoingCallInvite;

  const callParams = route.params as VoiceCallScreenParams;
  const outgoingCallerPhase = getOutgoingCallerPhase(callParams);
  const streamBootstrap = getVoiceBootstrap(callParams);
  const [sdk, setSdk] = useState<null | {
    StreamVideo: React.ComponentType<{ client: unknown; children: React.ReactNode }>;
    StreamCall: React.ComponentType<{ call: unknown; children: React.ReactNode }>;
    CallContent: React.ComponentType<{ onHangupCallHandler: () => void }>;
    StreamVideoClient: {
      getOrCreateInstance: (args: {
        apiKey: string;
        user: { id: string; name: string; image?: string };
        token: string;
      }) => {
        call: (type: string, id: string) => {
          getOrCreate: () => Promise<void>;
          join: (args: { create: boolean }) => Promise<void>;
          leave: () => Promise<void>;
        };
        disconnectUser: () => Promise<void>;
      };
    };
  }>(null);
  const [client, setClient] = useState<{
    call: (type: string, id: string) => {
      getOrCreate: () => Promise<void>;
      join: (args: { create: boolean }) => Promise<void>;
      leave: () => Promise<void>;
    };
    disconnectUser: () => Promise<void>;
  } | null>(null);
  const [call, setCall] = useState<{
    getOrCreate: () => Promise<void>;
    join: (args: { create: boolean }) => Promise<void>;
    leave: () => Promise<void>;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [liveSettledAmountInr, setLiveSettledAmountInr] = useState(0);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const autoEndByBalanceRef = useRef(false);
  const activeCallRef = useRef<{
    leave: () => Promise<void>;
  } | null>(null);
  const activeClientRef = useRef<{
    disconnectUser: () => Promise<void>;
  } | null>(null);
  const signalSocketRef = useRef<Socket | null>(null);
  const readyRef = useRef(false);
  const endingRef = useRef(false);
  const endedSessionRef = useRef(false);
  const endedSessionResultRef = useRef<{ canRate: boolean } | null>(null);
  const endSessionPromiseRef = useRef<Promise<{ canRate: boolean } | null> | null>(null);
  const callIdRef = useRef(getVoiceBootstrap(callParams)?.callId ?? '');
  const rawEarnRate = getReceiverEarnRatePerMinute(callParams);
  const liveRatePerMinute =
    typeof rawEarnRate === 'number' && Number.isFinite(rawEarnRate) ? Math.max(0, rawEarnRate) : 0;
  const liveEarning = Math.round(((elapsedSec / 60) * liveRatePerMinute) * 100) / 100;
  const shownLiveEarning = Math.max(liveEarning, liveSettledAmountInr);
  const showLiveEarning = user?.role === 'receiver';
  const callerWalletInr =
    user?.role === 'caller' && typeof user.walletBalance === 'number' && Number.isFinite(user.walletBalance)
      ? Math.max(0, user.walletBalance)
      : 0;
  const callerRatePerMinute = getReceiverChargeRatePerMinute(callParams);
  const initialCallerTalkSec =
    user?.role === 'caller' && callerRatePerMinute > 0
      ? Math.floor((callerWalletInr / callerRatePerMinute) * 60)
      : 0;
  const callerRemainingTalkSec =
    user?.role === 'caller'
      ? Math.max(0, initialCallerTalkSec - elapsedSec)
      : 0;
  const showCallerCountdown = user?.role === 'caller' && callerRatePerMinute > 0;

  const callerCanRateByDuration = user?.role === 'caller' && elapsedSec >= MIN_RATING_SECONDS;

  /** Kept in refs so the signaling socket effect does not re-run when duration crosses the rating threshold (that was disconnecting the socket ~55s into the call). */
  const callerCanRateByDurationRef = useRef(callerCanRateByDuration);
  const userRoleRef = useRef(user?.role);
  useEffect(() => {
    callerCanRateByDurationRef.current = callerCanRateByDuration;
    userRoleRef.current = user?.role;
  }, [callerCanRateByDuration, user?.role]);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  const formatHms = (totalSec: number): string => {
    const safe = Math.max(0, Math.floor(totalSec));
    const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
    const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
    const ss = String(safe % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const ensureSessionEnded = async (): Promise<{ canRate: boolean } | null> => {
    if (endedSessionRef.current) return endedSessionResultRef.current;
    if (endSessionPromiseRef.current) return endSessionPromiseRef.current;
    endSessionPromiseRef.current = (async () => {
      try {
        const { data } = await callApi.sessionEnd(callIdRef.current);
        const result = { canRate: Boolean(data.canRate) };
        endedSessionRef.current = true;
        endedSessionResultRef.current = result;
        setLiveSettledAmountInr(
          typeof data.receiverEarnedInr === 'number' && Number.isFinite(data.receiverEarnedInr)
            ? Math.max(0, data.receiverEarnedInr)
            : 0
        );
        return result;
      } catch {
        // Allow future retries if a transient failure happens now.
        return null;
      } finally {
        endSessionPromiseRef.current = null;
      }
    })();
    return endSessionPromiseRef.current;
  };

  const showRatingPrompt = () => {
    setSelectedRating(0);
    setRatingOpen(true);
  };

  const showRatingPromptRef = useRef(showRatingPrompt);
  showRatingPromptRef.current = showRatingPrompt;

  const stopQueueAndExit = () => {
    try {
      signalSocketRef.current?.emit('call:queue:set', { active: false });
    } catch {
      // ignore signaling failures
    }
    if (user?.role === 'caller') {
      (navigation as any).navigate('CallerDiscover');
      return;
    }
    (navigation as any).navigate('ReceiverHome');
  };

  const leaveMedia = async () => {
    try {
      if (activeCallRef.current) await activeCallRef.current.leave();
    } catch {
      // Ignore leave failures.
    }
    try {
      if (activeClientRef.current) await activeClientRef.current.disconnectUser();
    } catch {
      // Ignore disconnect failures.
    }
  };

  const networkDropMessage =
    'Call disconnected due to network issues. Please check your internet connection.';

  const ensureSessionEndedRef = useRef(ensureSessionEnded);
  const leaveMediaRef = useRef(leaveMedia);
  const stopQueueAndExitRef = useRef(stopQueueAndExit);
  useEffect(() => {
    ensureSessionEndedRef.current = ensureSessionEnded;
    leaveMediaRef.current = leaveMedia;
    stopQueueAndExitRef.current = stopQueueAndExit;
  });

  useEffect(() => {
    if (Constants.appOwnership === 'expo') {
      Alert.alert(
        'Development build required',
        'Voice calling uses native WebRTC modules and will not work in Expo Go. Build and run a development build first.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  }, [navigation]);

  useEffect(() => {
    const id = streamBootstrap?.callId;
    if (id) callIdRef.current = id;
  }, [streamBootstrap?.callId]);

  useEffect(() => {
    if (user?.role !== 'caller' || outgoingCallerPhase !== 'ringing') return;
    let stopFn: (() => Promise<void>) | undefined;
    void (async () => {
      try {
        stopFn = await startOutboundRingtoneLoop();
      } catch {
        // ignore ring load failures
      }
    })();
    return () => {
      void stopFn?.();
    };
  }, [user?.role, outgoingCallerPhase]);

  const outgoingPhaseCleanupRef = useRef(outgoingCallerPhase);
  outgoingPhaseCleanupRef.current = outgoingCallerPhase;
  useEffect(() => {
    return () => {
      if (userRoleRef.current === 'caller' && outgoingPhaseCleanupRef.current === 'ringing') {
        cancelOutgoingRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (Constants.appOwnership === 'expo') {
      return;
    }

    const phaseNow = getOutgoingCallerPhase(route.params as VoiceCallScreenParams);
    const boot = getVoiceBootstrap(route.params as VoiceCallScreenParams);
    if (phaseNow === 'ringing' || !boot) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const streamSdk = require('@stream-io/video-react-native-sdk') as {
          StreamVideo: React.ComponentType<{ client: unknown; children: React.ReactNode }>;
          StreamCall: React.ComponentType<{ call: unknown; children: React.ReactNode }>;
          CallContent: React.ComponentType<{ onHangupCallHandler: () => void }>;
          StreamVideoClient: {
            getOrCreateInstance: (args: {
              apiKey: string;
              user: { id: string; name: string; image?: string };
              token: string;
            }) => {
              call: (type: string, id: string) => {
                getOrCreate: () => Promise<void>;
                join: (args: { create: boolean }) => Promise<void>;
                leave: () => Promise<void>;
              };
              disconnectUser: () => Promise<void>;
            };
          };
        };
        setSdk(streamSdk);

        const mic = await Audio.requestPermissionsAsync();
        if (mic.status !== 'granted') {
          throw new Error('Microphone permission is required for voice calls');
        }
        await applyVoiceCallAudioMode(true);

        const nextClient = streamSdk.StreamVideoClient.getOrCreateInstance({
          apiKey: boot.apiKey,
          user: {
            id: boot.streamUserId,
            name: user?.name ?? 'User',
            image: profileImageUrlForStreamOrNetwork(user?.profileImage),
          },
          token: boot.token,
        });
        activeClientRef.current = nextClient;

        const nextCall = nextClient.call(boot.callType, boot.callId);
        activeCallRef.current = nextCall;
        await nextCall.getOrCreate();
        await nextCall.join({ create: true });
        await callApi.sessionStart(boot.callId, boot.peerAccountId);

        if (!cancelled) {
          setClient(nextClient);
          setCall(nextCall);
          setReady(true);
          setError(null);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to join call';
        if (!cancelled) {
          setError(msg);
          Alert.alert('Voice call error', msg, [{ text: 'OK', onPress: () => navigation.goBack() }]);
        }
      }
    })();

    return () => {
      cancelled = true;
      void resetVoiceCallAudioMode();
      void (async () => {
        if (!endingRef.current) {
          await ensureSessionEnded();
          await leaveMedia();
        }
      })();
    };
  }, [
    navigation,
    outgoingCallerPhase,
    streamBootstrap?.apiKey,
    streamBootstrap?.callId,
    streamBootstrap?.callType,
    streamBootstrap?.peerAccountId,
    streamBootstrap?.peerStreamUserId,
    streamBootstrap?.streamUserId,
    streamBootstrap?.token,
    user?.name,
    user?.profileImage,
  ]);

  useEffect(() => {
    let cancelled = false;
    const reconnectFailedHandlerRef: { current: (() => void) | null } = { current: null };
    const base = getResolvedApiBaseUrl();
    void (async () => {
      const token = await getJwt();
      if (!token || cancelled) return;
      const socket = io(base, {
        auth: { token },
        transports: ['polling', 'websocket'],
        timeout: 20000,
      });
      signalSocketRef.current = socket;
      const onReconnectFailed = (): void => {
        if (!readyRef.current || endingRef.current) return;
        endingRef.current = true;
        Alert.alert('Connection lost', networkDropMessage, [
          {
            text: 'OK',
            onPress: () => {
              void (async () => {
                if (userRoleRef.current === 'caller' && callerCanRateByDurationRef.current) {
                  await ensureSessionEndedRef.current();
                  await leaveMediaRef.current();
                  showRatingPromptRef.current();
                  return;
                }
                void ensureSessionEndedRef.current();
                await leaveMediaRef.current();
                stopQueueAndExitRef.current();
              })();
            },
          },
        ]);
      };
      reconnectFailedHandlerRef.current = onReconnectFailed;
      const ioMgr = (socket as unknown as { io?: { on: (ev: string, fn: () => void) => void; off: (ev: string, fn: () => void) => void } }).io;
      ioMgr?.on('reconnect_failed', onReconnectFailed);

      socket.on('call:ended', (payload: { callId: string; fromType: 'u' | 'r'; fromId: string }) => {
        if (!payload || payload.callId !== callIdRef.current) return;
        if (endingRef.current) return;
        endingRef.current = true;
        void (async () => {
          if (userRoleRef.current === 'caller' && callerCanRateByDurationRef.current) {
            await ensureSessionEnded();
            await leaveMedia();
            showRatingPrompt();
            return;
          }
          void ensureSessionEnded();
          await leaveMedia();
          stopQueueAndExit();
        })();
      });
    })();

    return () => {
      cancelled = true;
      const s = signalSocketRef.current;
      if (s) {
        const ioMgr = (s as unknown as { io?: { off: (ev: string, fn: () => void) => void } }).io;
        const h = reconnectFailedHandlerRef.current;
        if (h) ioMgr?.off('reconnect_failed', h);
        s.removeAllListeners();
        s.disconnect();
      }
      signalSocketRef.current = null;
    };
    // Intentionally static: do not depend on callerCanRateByDuration (flips at 55s) or the socket will reconnect and drop the call.
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => setElapsedSec((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    if (!ready || endingRef.current) return;
    const poll = setInterval(() => {
      if (endingRef.current) return;
      void (async () => {
        try {
          const { data } = await callApi.sessionSync(callIdRef.current);
          if (!data?.ok) return;
          if (typeof data.durationSec === 'number' && Number.isFinite(data.durationSec) && data.durationSec >= 0) {
            setElapsedSec((prev) => (data.durationSec > prev ? data.durationSec : prev));
          }
          if (
            typeof data.receiverEarnedInr === 'number' &&
            Number.isFinite(data.receiverEarnedInr) &&
            data.receiverEarnedInr >= 0
          ) {
            setLiveSettledAmountInr((prev) => (data.receiverEarnedInr > prev ? data.receiverEarnedInr : prev));
          }
        } catch {
          // Best-effort live settlement sync.
        }
      })();
    }, 5000);
    return () => clearInterval(poll);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (user?.role !== 'caller') return;
    if (!showCallerCountdown) return;
    if (callerRemainingTalkSec > 0) return;
    if (endingRef.current || autoEndByBalanceRef.current) return;
    autoEndByBalanceRef.current = true;
    void (async () => {
      Alert.alert('Call ended', 'Your talk time is over.');
      await hangup();
    })();
  }, [callerRemainingTalkSec, ready, showCallerCountdown, user?.role]);

  const hangup = async () => {
    if (user?.role === 'caller' && getOutgoingCallerPhase(route.params as VoiceCallScreenParams) === 'ringing') {
      cancelOutgoingCallInvite();
      navigation.goBack();
      return;
    }
    if (endingRef.current) return;
    endingRef.current = true;

    try {
      signalSocketRef.current?.emit('call:end', { callId: callIdRef.current });
    } catch {
      // ignore signaling failures
    }

    if (user?.role === 'caller' && callerCanRateByDuration) {
      await ensureSessionEnded();
      await leaveMedia();
      showRatingPrompt();
      return;
    }
    void ensureSessionEnded();
    await leaveMedia();
    stopQueueAndExit();
  };

  const toggleSpeaker = async () => {
    const next = !speakerOn;
    try {
      await applyVoiceCallAudioMode(next);
      setSpeakerOn(next);
    } catch (e) {
      Alert.alert('Speaker', getErrorMessage(e));
    }
  };

  const toggleMute = async () => {
    try {
      if (!call) return;
      const mic = (call as any).microphone;
      if (mic?.disable && !muted) {
        await mic.disable();
        setMuted(true);
      } else if (mic?.enable && muted) {
        await mic.enable();
        setMuted(false);
      } else if (mic?.toggle) {
        await mic.toggle();
        setMuted((m) => !m);
      } else {
        setMuted((m) => !m);
      }
    } catch (e) {
      Alert.alert('Mute failed', getErrorMessage(e));
    }
  };

  const showStreamChrome = ready && Boolean(client) && Boolean(call) && Boolean(sdk);
  const showPreJoinUi =
    !error &&
    !showStreamChrome &&
    (outgoingCallerPhase === 'ringing' ||
      outgoingCallerPhase === 'joining' ||
      Boolean(streamBootstrap));

  const preJoinStatusLabel = outgoingCallerPhase === 'ringing' ? 'Calling…' : 'Connecting';
  const preJoinHangupLabel =
    user?.role === 'caller' && outgoingCallerPhase === 'ringing' ? 'Cancel' : 'Disconnect';

  if (error && !showStreamChrome) {
    return (
      <View style={styles.center}>
        <LinearGradient
          colors={['#0a0014', '#1e0b3d', '#4c1d95', '#6d28d9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Text style={styles.loadingText}>{error}</Text>
        <TouchableOpacity
          style={styles.preJoinBackBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.88}
        >
          <Text style={styles.preJoinBackBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showPreJoinUi) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#0a0014', '#1e0b3d', '#4c1d95', '#6d28d9', '#7c3aed']}
          locations={[0, 0.22, 0.48, 0.72, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.overlay, { paddingTop: Math.max(insets.top + 16, 36) }]}>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{preJoinStatusLabel}</Text>
          </View>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCol}>
              <View style={styles.avatarRingHost}>
                <AvatarSoundWaveRings />
                <View style={styles.avatarWrap}>
                  {(() => {
                    const peerSrc = callParams.peerImage
                      ? resolveProfileImageSource(callParams.peerImage)
                      : null;
                    return peerSrc ? (
                      <Image source={peerSrc} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarInitial}>
                          {(callParams.peerName || 'U').trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
              <Text style={styles.avatarCaption} numberOfLines={1}>
                {callParams.peerName || 'Contact'}
              </Text>
            </View>
            <View style={styles.avatarCol}>
              <View style={styles.avatarRingHost}>
                <AvatarSoundWaveRings />
                <View style={styles.avatarWrap}>
                  {(() => {
                    const selfSrc = user?.profileImage
                      ? resolveProfileImageSource(user.profileImage)
                      : null;
                    return selfSrc ? (
                      <Image source={selfSrc} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarInitial}>
                          {(user?.name || 'Y').trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
              <Text style={styles.avatarCaption}>You</Text>
            </View>
          </View>
          <Text style={styles.peerName}>{callParams.peerName}</Text>
          {showCallerCountdown ? (
            <View style={styles.countdownCard}>
              <Text style={styles.countdownTitle}>Remaining Talk Time</Text>
              <Text style={styles.countdownValue}>{formatHms(callerRemainingTalkSec)}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.hangup} onPress={() => void hangup()} activeOpacity={0.88}>
            <LinearGradient
              colors={['#9d174d', '#be185d', '#db2777']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hangupGrad}
            >
              <Text style={styles.hangupText}>{preJoinHangupLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!(ready && client && call && sdk)) {
    return <View style={{ flex: 1, backgroundColor: '#0a0014' }} />;
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0014', '#1e0b3d', '#4c1d95', '#6d28d9', '#7c3aed']}
        locations={[0, 0.22, 0.48, 0.72, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <sdk.StreamVideo client={client}>
        <sdk.StreamCall call={call}>
          <View style={[styles.overlay, { paddingTop: Math.max(insets.top + 16, 36) }]}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>Call Active</Text>
            </View>
            <View style={styles.avatarRow}>
              <View style={styles.avatarCol}>
                <View style={styles.avatarRingHost}>
                  <AvatarSoundWaveRings />
                  <View style={styles.avatarWrap}>
                    {(() => {
                      const peerSrc = route.params.peerImage
                        ? resolveProfileImageSource(route.params.peerImage)
                        : null;
                      return peerSrc ? (
                        <Image source={peerSrc} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                          <Text style={styles.avatarInitial}>
                            {(route.params.peerName || 'U').trim().charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>
                <Text style={styles.avatarCaption} numberOfLines={1}>
                  {route.params.peerName || 'Contact'}
                </Text>
              </View>
              <View style={styles.avatarCol}>
                <View style={styles.avatarRingHost}>
                  <AvatarSoundWaveRings />
                  <View style={styles.avatarWrap}>
                    {(() => {
                      const selfSrc = user?.profileImage
                        ? resolveProfileImageSource(user.profileImage)
                        : null;
                      return selfSrc ? (
                        <Image source={selfSrc} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                          <Text style={styles.avatarInitial}>
                            {(user?.name || 'Y').trim().charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>
                <Text style={styles.avatarCaption}>You</Text>
              </View>
            </View>
            <Text style={styles.peerName}>{route.params.peerName}</Text>
            <Text style={styles.durationLabel}>Duration</Text>
            <Text style={styles.durationValue}>
              {`${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:${String(elapsedSec % 60).padStart(2, '0')}`}
            </Text>
            {showCallerCountdown ? (
              <View style={styles.countdownCard}>
                <Text style={styles.countdownTitle}>Remaining Talk Time</Text>
                <Text style={styles.countdownValue}>{formatHms(callerRemainingTalkSec)}</Text>
              </View>
            ) : null}
            {showLiveEarning ? (
              <LinearGradient
                colors={['#5b21b6', '#7c3aed', '#a78bfa']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.earningCard}
              >
                <Text style={styles.earningTitle}>Live Earning</Text>
                <Text style={styles.earningValue}>₹{shownLiveEarning}</Text>
                <Text style={styles.earningSub}>Updating every second</Text>
              </LinearGradient>
            ) : null}
            <View style={styles.controls}>
              <TouchableOpacity
                style={[styles.roundBtn, muted && styles.roundBtnActive]}
                onPress={() => void toggleMute()}
                activeOpacity={0.85}
              >
                <Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color="#faf5ff" />
                <Text style={styles.roundText}>{muted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roundBtn, speakerOn && styles.roundBtnActive]}
                onPress={() => void toggleSpeaker()}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={speakerOn ? 'volume-high' : 'phone-portrait-outline'}
                  size={26}
                  color="#faf5ff"
                />
                <Text style={styles.roundText}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.hangup} onPress={hangup} activeOpacity={0.88}>
              <LinearGradient
                colors={['#9d174d', '#be185d', '#db2777']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hangupGrad}
              >
                <Text style={styles.hangupText}>
                  {user?.role === 'receiver' ? 'Go Offline' : 'Disconnect'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </sdk.StreamCall>
      </sdk.StreamVideo>
      <Modal visible={ratingOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.ratingCard}>
            <Text style={styles.ratingTitle}>Rate this call</Text>
            <Text style={styles.ratingSubtitle}>How was the call quality?</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  activeOpacity={0.75}
                  onPress={() => setSelectedRating(n)}
                  style={styles.starHit}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${n} out of 5`}
                >
                  <Ionicons
                    name={n <= selectedRating ? 'star' : 'star-outline'}
                    size={38}
                    color={n <= selectedRating ? '#fbbf24' : '#c4b5fd'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.ratingSubmitOuter, selectedRating === 0 && styles.ratingSubmitBtnOff]}
              disabled={selectedRating === 0 || submittingRating}
              activeOpacity={0.88}
              onPress={() => {
                void (async () => {
                  if (!selectedRating) return;
                  setSubmittingRating(true);
                  try {
                    await callApi.sessionRate(callIdRef.current, selectedRating);
                  } catch {
                    // Keep exit behavior even if rating submit fails.
                  } finally {
                    setSubmittingRating(false);
                    setRatingOpen(false);
                    stopQueueAndExit();
                  }
                })();
              }}
            >
              <LinearGradient
                colors={['#6d28d9', '#7c3aed', '#a78bfa']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ratingSubmitGrad}
              >
                <Text style={styles.ratingSubmitText}>{submittingRating ? 'Submitting...' : 'Submit'}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ratingSkipBtn}
              disabled={submittingRating}
              onPress={() => {
                setRatingOpen(false);
                stopQueueAndExit();
              }}
            >
              <Text style={styles.ratingSkipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0014' },
  overlay: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(10, 0, 20, 0.35)',
  },
  statusPill: {
    backgroundColor: 'rgba(124, 58, 237, 0.95)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(233, 213, 255, 0.45)',
  },
  statusText: { color: '#faf5ff', fontSize: 12, fontWeight: '800' },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 22,
    marginTop: 6,
  },
  avatarCol: {
    alignItems: 'center',
    maxWidth: 150,
  },
  avatarRingHost: {
    width: 124,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCaption: {
    marginTop: 8,
    color: '#ede9fe',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  avatarWrap: {
    width: 102,
    height: 102,
    borderRadius: 51,
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(196, 181, 253, 0.55)',
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#1e1b4b',
    borderWidth: 2,
    borderColor: 'rgba(250,245,255,0.35)',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#e9d5ff',
    fontSize: 30,
    fontWeight: '900',
  },
  peerName: { marginTop: 14, color: '#faf5ff', fontSize: 28, fontWeight: '900' },
  durationLabel: { marginTop: 20, color: '#c4b5fd', fontSize: 13, fontWeight: '700' },
  durationValue: { marginTop: 4, color: '#f5f3ff', fontSize: 46, fontWeight: '900' },
  earningCard: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(233, 213, 255, 0.35)',
  },
  earningTitle: { color: '#faf5ff', fontSize: 12, fontWeight: '700' },
  earningValue: { color: '#fff', fontSize: 34, fontWeight: '900' },
  earningSub: { color: 'rgba(245,243,255,0.85)', fontSize: 10, marginTop: 2, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: 18, marginTop: 44 },
  roundBtn: {
    width: 78,
    minHeight: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(91, 33, 182, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.35)',
  },
  roundBtnActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.85)',
    borderColor: 'rgba(233, 213, 255, 0.65)',
  },
  roundText: { color: '#faf5ff', fontSize: 10, fontWeight: '800', marginTop: 4 },
  hangup: {
    marginTop: 26,
    borderRadius: 14,
    minWidth: 200,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  hangupGrad: {
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 24,
  },
  hangupText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0014',
    paddingHorizontal: 20,
    gap: 12,
  },
  loadingText: { color: '#e9d5ff', fontSize: 15, textAlign: 'center', fontWeight: '600' },
  preJoinBackBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.5)',
  },
  preJoinBackBtnText: { color: '#faf5ff', fontSize: 15, fontWeight: '700' },
  countdownCard: {
    marginTop: 12,
    backgroundColor: 'rgba(30, 27, 75, 0.88)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
  },
  countdownTitle: { color: '#c4b5fd', fontSize: 11, fontWeight: '700' },
  countdownValue: { color: '#faf5ff', fontSize: 28, fontWeight: '900', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(46, 16, 101, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ratingCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    backgroundColor: '#faf5ff',
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  ratingTitle: { fontSize: 20, fontWeight: '900', color: '#3b0764' },
  ratingSubtitle: { marginTop: 6, fontSize: 13, color: '#6d28d9', fontWeight: '600' },
  starRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  starHit: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingSubmitOuter: {
    marginTop: 20,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  ratingSubmitGrad: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  ratingSubmitBtnOff: { opacity: 0.45 },
  ratingSubmitText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  ratingSkipBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 12 },
  ratingSkipText: { color: '#6d28d9', fontSize: 14, fontWeight: '700' },
});
