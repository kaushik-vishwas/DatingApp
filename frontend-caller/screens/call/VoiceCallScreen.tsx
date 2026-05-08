import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { useAuth } from '../../context/AuthContext';
import { callApi, getErrorMessage, getJwt, getResolvedApiBaseUrl } from '../../services/api';
import { resolveProfileImageSource } from '../../utils/avatarSource';

type Props =
  | NativeStackScreenProps<CallerStackParamList, 'VoiceCall'>
  | NativeStackScreenProps<ReceiverStackParamList, 'VoiceCall'>;

export default function VoiceCallScreen({ navigation, route }: Props): React.JSX.Element {
  const MIN_RATING_SECONDS = 55;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
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
  const endingRef = useRef(false);
  const endedSessionRef = useRef(false);
  const endedSessionResultRef = useRef<{ canRate: boolean } | null>(null);
  const endSessionPromiseRef = useRef<Promise<{ canRate: boolean } | null> | null>(null);
  const callIdRef = useRef(route.params.callId);
  const rawEarnRate = route.params.receiverEarningRatePerMinute;
  const liveRatePerMinute =
    typeof rawEarnRate === 'number' && Number.isFinite(rawEarnRate) ? Math.max(0, rawEarnRate) : 0;
  const liveEarning = Math.round(((elapsedSec / 60) * liveRatePerMinute) * 100) / 100;
  const shownLiveEarning = Math.max(liveEarning, liveSettledAmountInr);
  const showLiveEarning = user?.role === 'receiver';
  const callerWalletInr =
    user?.role === 'caller' && typeof user.walletBalance === 'number' && Number.isFinite(user.walletBalance)
      ? Math.max(0, user.walletBalance)
      : 0;
  const callerRatePerMinute = Number.isFinite(route.params.receiverRatePerMinute)
    ? Math.max(0, route.params.receiverRatePerMinute)
    : 0;
  const initialCallerTalkSec =
    user?.role === 'caller' && callerRatePerMinute > 0
      ? Math.floor((callerWalletInr / callerRatePerMinute) * 60)
      : 0;
  const callerRemainingTalkSec =
    user?.role === 'caller'
      ? Math.max(0, initialCallerTalkSec - elapsedSec)
      : 0;
  const showCallerCountdown = user?.role === 'caller' && callerRatePerMinute > 0;

  const callLabel = useMemo(
    () => `Voice call with ${route.params.peerName}`,
    [route.params.peerName]
  );
  const callerCanRateByDuration = user?.role === 'caller' && elapsedSec >= MIN_RATING_SECONDS;
  const selfAvatarSource = resolveProfileImageSource(user?.profileImage);

  /** Kept in refs so the signaling socket effect does not re-run when duration crosses the rating threshold (that was disconnecting the socket ~55s into the call). */
  const callerCanRateByDurationRef = useRef(callerCanRateByDuration);
  const userRoleRef = useRef(user?.role);
  useEffect(() => {
    callerCanRateByDurationRef.current = callerCanRateByDuration;
    userRoleRef.current = user?.role;
  }, [callerCanRateByDuration, user?.role]);

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

  useEffect(() => {
    if (Constants.appOwnership === 'expo') {
      Alert.alert(
        'Development build required',
        'Voice calling uses native WebRTC modules and will not work in Expo Go. Build and run a development build first.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
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

        const nextClient = streamSdk.StreamVideoClient.getOrCreateInstance({
          apiKey: route.params.apiKey,
          user: {
            id: route.params.streamUserId,
            name: user?.name ?? 'User',
            image: user?.profileImage ?? undefined,
          },
          token: route.params.token,
        });
        activeClientRef.current = nextClient;

        const nextCall = nextClient.call(route.params.callType, route.params.callId);
        activeCallRef.current = nextCall;
        await nextCall.getOrCreate();
        await nextCall.join({ create: true });
        await callApi.sessionStart(route.params.callId, route.params.peerAccountId);

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
      void (async () => {
        if (!endingRef.current) {
          await ensureSessionEnded();
          await leaveMedia();
        }
      })();
    };
  }, [
    navigation,
    route.params.apiKey,
    route.params.callId,
    route.params.callType,
    route.params.peerAccountId,
    route.params.peerStreamUserId,
    route.params.streamUserId,
    route.params.token,
    user?.name,
    user?.profileImage,
  ]);

  useEffect(() => {
    let cancelled = false;
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

  if (!ready || !client || !call || !sdk) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7b2cff" />
        <Text style={styles.loadingText}>{error ?? `Connecting ${callLabel}...`}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <sdk.StreamVideo client={client}>
        <sdk.StreamCall call={call}>
          <View style={[styles.overlay, { paddingTop: Math.max(insets.top + 16, 36) }]}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>Call Active</Text>
            </View>
            <View style={styles.avatarRow}>
              <View style={styles.avatarCol}>
                <View style={styles.avatarWrap}>
                  {route.params.peerImage ? (
                    <Image source={{ uri: route.params.peerImage }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {(route.params.peerName || 'U').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.avatarCaption} numberOfLines={1}>
                  {route.params.peerName || 'Contact'}
                </Text>
              </View>
              <View style={styles.avatarCol}>
                <View style={styles.avatarWrap}>
                  {selfAvatarSource ? (
                    <Image source={selfAvatarSource} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {(user?.name || 'Y').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
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
              <View style={styles.earningCard}>
                <Text style={styles.earningTitle}>Live Earning</Text>
                <Text style={styles.earningValue}>₹{shownLiveEarning}</Text>
                <Text style={styles.earningSub}>Updating every second</Text>
              </View>
            ) : null}
            <View style={styles.controls}>
              <TouchableOpacity style={styles.roundBtn} onPress={toggleMute}>
                <Text style={styles.roundText}>{muted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.roundBtn}>
                <Text style={styles.roundText}>Speaker</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.hangup} onPress={hangup}>
              <Text style={styles.hangupText}>
                {user?.role === 'receiver' ? 'Go Offline' : 'Disconnect'}
              </Text>
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
                    color={n <= selectedRating ? '#f59e0b' : '#d1d5db'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.ratingSubmitBtn, selectedRating === 0 && styles.ratingSubmitBtnOff]}
              disabled={selectedRating === 0 || submittingRating}
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
              <Text style={styles.ratingSubmitText}>{submittingRating ? 'Submitting...' : 'Submit'}</Text>
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
  container: { flex: 1, backgroundColor: '#f379d9' },
  overlay: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#ea78d6',
  },
  statusPill: {
    backgroundColor: '#2ad07f',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 16,
  },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 22,
    marginTop: 6,
  },
  avatarCol: {
    alignItems: 'center',
    maxWidth: 140,
  },
  avatarCaption: {
    marginTop: 8,
    color: '#333',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  avatarWrap: {
    width: 102,
    height: 102,
    borderRadius: 51,
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#555',
    fontSize: 30,
    fontWeight: '900',
  },
  peerName: { marginTop: 14, color: '#222', fontSize: 30, fontWeight: '900' },
  durationLabel: { marginTop: 20, color: '#333', fontSize: 13, fontWeight: '700' },
  durationValue: { marginTop: 4, color: '#222', fontSize: 46, fontWeight: '900' },
  earningCard: {
    marginTop: 14,
    backgroundColor: '#19cf68',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  earningTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
  earningValue: { color: '#fff', fontSize: 34, fontWeight: '900' },
  earningSub: { color: '#d0ffe3', fontSize: 10, marginTop: 2, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: 18, marginTop: 48 },
  roundBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  hangup: {
    marginTop: 26,
    backgroundColor: '#ff3048',
    borderRadius: 12,
    minWidth: 180,
    alignItems: 'center',
    paddingVertical: 14,
  },
  hangupText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 20,
    gap: 10,
  },
  loadingText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  countdownCard: {
    marginTop: 12,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  countdownTitle: { color: '#d1d5db', fontSize: 11, fontWeight: '700' },
  countdownValue: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ratingCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
  },
  ratingTitle: { fontSize: 20, fontWeight: '900', color: '#111' },
  ratingSubtitle: { marginTop: 6, fontSize: 13, color: '#666', fontWeight: '600' },
  starRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  starHit: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingSubmitBtn: {
    marginTop: 20,
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#7b2cff',
    alignItems: 'center',
    paddingVertical: 12,
  },
  ratingSubmitBtnOff: { opacity: 0.45 },
  ratingSubmitText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  ratingSkipBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 12 },
  ratingSkipText: { color: '#666', fontSize: 14, fontWeight: '700' },
});
