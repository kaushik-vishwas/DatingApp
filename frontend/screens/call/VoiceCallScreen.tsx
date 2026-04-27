import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { useAuth } from '../../context/AuthContext';
import { callApi, getErrorMessage, getJwt, getResolvedApiBaseUrl } from '../../services/api';

type Props =
  | NativeStackScreenProps<CallerStackParamList, 'VoiceCall'>
  | NativeStackScreenProps<ReceiverStackParamList, 'VoiceCall'>;

export default function VoiceCallScreen({ navigation, route }: Props): React.JSX.Element {
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
  const activeCallRef = useRef<{
    leave: () => Promise<void>;
  } | null>(null);
  const activeClientRef = useRef<{
    disconnectUser: () => Promise<void>;
  } | null>(null);
  const signalSocketRef = useRef<Socket | null>(null);
  const endingRef = useRef(false);
  const endedSessionRef = useRef(false);
  const callIdRef = useRef(route.params.callId);
  const liveRatePerMinute = Number.isFinite(route.params.receiverRatePerMinute)
    ? Math.max(0, route.params.receiverRatePerMinute)
    : 0;
  const liveEarning = Math.round(((elapsedSec / 60) * liveRatePerMinute) * 100) / 100;
  const showLiveEarning = user?.role === 'receiver';

  const callLabel = useMemo(
    () => `Voice call with ${route.params.peerName}`,
    [route.params.peerName]
  );

  const ensureSessionEnded = async () => {
    if (endedSessionRef.current) return;
    endedSessionRef.current = true;
    try {
      await callApi.sessionEnd(callIdRef.current);
    } catch {
      // Ignore best-effort session end failures.
    }
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
          await ensureSessionEnded();
          await leaveMedia();
          Alert.alert('Call ended', `${route.params.peerName} ended the call.`, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
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
  }, [navigation, route.params.peerName]);

  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => setElapsedSec((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [ready]);

  const hangup = async () => {
    if (endingRef.current) return;
    endingRef.current = true;

    try {
      signalSocketRef.current?.emit('call:end', { callId: callIdRef.current });
    } catch {
      // ignore signaling failures
    }
    await ensureSessionEnded();
    await leaveMedia();

    if (user?.role === 'caller') {
      Alert.alert('Rate this call', 'How was the call quality?', [
        { text: 'Skip', onPress: () => navigation.goBack() },
        { text: '3', onPress: async () => { try { await callApi.sessionRate(callIdRef.current, 3); } catch { /* ignore */ } navigation.goBack(); } },
        { text: '4', onPress: async () => { try { await callApi.sessionRate(callIdRef.current, 4); } catch { /* ignore */ } navigation.goBack(); } },
        { text: '5', onPress: async () => { try { await callApi.sessionRate(callIdRef.current, 5); } catch { /* ignore */ } navigation.goBack(); } },
      ]);
      return;
    }
    navigation.goBack();
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
            <View style={styles.avatar} />
            <Text style={styles.peerName}>{route.params.peerName}</Text>
            <Text style={styles.durationLabel}>Duration</Text>
            <Text style={styles.durationValue}>
              {`${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:${String(elapsedSec % 60).padStart(2, '0')}`}
            </Text>
            {showLiveEarning ? (
              <View style={styles.earningCard}>
                <Text style={styles.earningTitle}>Live Earning</Text>
                <Text style={styles.earningValue}>₹{liveEarning}</Text>
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
              <Text style={styles.hangupText}>End Call</Text>
            </TouchableOpacity>
          </View>
        </sdk.StreamCall>
      </sdk.StreamVideo>
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
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#fff',
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
});
