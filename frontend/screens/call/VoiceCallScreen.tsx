import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { useAuth } from '../../context/AuthContext';

type Props =
  | NativeStackScreenProps<CallerStackParamList, 'VoiceCall'>
  | NativeStackScreenProps<ReceiverStackParamList, 'VoiceCall'>;

export default function VoiceCallScreen({ navigation, route }: Props): React.JSX.Element {
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

  const callLabel = useMemo(
    () => `Voice call with ${route.params.peerName}`,
    [route.params.peerName]
  );

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
    let activeCall: {
      leave: () => Promise<void>;
    } | null = null;
    let activeClient: {
      disconnectUser: () => Promise<void>;
    } | null = null;

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
        activeClient = nextClient;

        const nextCall = nextClient.call(route.params.callType, route.params.callId);
        activeCall = nextCall;
        await nextCall.getOrCreate();
        await nextCall.join({ create: true });

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
        try {
          if (activeCall) await activeCall.leave();
        } catch {
          // Ignore leave failures on unmount.
        }
        try {
          if (activeClient) await activeClient.disconnectUser();
        } catch {
          // Ignore disconnect failures on unmount.
        }
      })();
    };
  }, [
    navigation,
    route.params.apiKey,
    route.params.callId,
    route.params.callType,
    route.params.peerStreamUserId,
    route.params.streamUserId,
    route.params.token,
    user?.name,
    user?.profileImage,
  ]);

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
          <sdk.CallContent onHangupCallHandler={() => navigation.goBack()} />
        </sdk.StreamCall>
      </sdk.StreamVideo>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
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
