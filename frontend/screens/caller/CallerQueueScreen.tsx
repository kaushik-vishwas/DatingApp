import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../../context/AuthContext';
import { useCallSignals, type IncomingCallRequest } from '../../context/CallSignalContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { callApi, getErrorMessage } from '../../services/api';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerQueue'>;
const QUEUE_WAIT_MS = 60_000;
const RETRY_DELAY_MS = 3_000;
const WAITING_HINTS = ['Somebody will join soon.', 'Be polite on call.', 'Have patience.'];
const DEFAULT_RECEIVER_NAME = 'Receiver';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function CallerQueueScreen({ navigation, route }: Props): React.JSX.Element {
  const { user } = useAuth();
  const { setIncomingCallHandler, acceptIncomingCall, setQueueMode, startCallInvite } = useCallSignals();
  const [incoming, setIncoming] = useState<IncomingCallRequest | null>(null);
  const [joining, setJoining] = useState(false);
  const [calling, setCalling] = useState(false);
  const [waitLeftSec, setWaitLeftSec] = useState(Math.round(QUEUE_WAIT_MS / 1000));
  const [speakerOn, setSpeakerOn] = useState(true);
  const [bluetoothMic, setBluetoothMic] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const invitedRef = useRef(false);

  const peerId = route.params?.peerId ?? null;
  const peerName = route.params?.peerName ?? DEFAULT_RECEIVER_NAME;
  const peerImage = route.params?.peerImage ?? null;

  const selfName = useMemo(() => {
    const raw = user?.name?.trim();
    return raw && raw.length > 0 ? raw : 'You';
  }, [user?.name]);

  const selfInitial = useMemo(() => selfName.charAt(0).toUpperCase(), [selfName]);
  const [queuedPeerName, setQueuedPeerName] = useState(peerName);
  const [queuedPeerImage, setQueuedPeerImage] = useState<string | null>(null);
  const shownPeerName = incoming?.peerName ?? queuedPeerName;
  const shownPeerImage = incoming?.peerImage ?? queuedPeerImage;
  const peerInitial = useMemo(() => (shownPeerName.charAt(0) || '?').toUpperCase(), [shownPeerName]);

  const exitQueue = useCallback(
    (mode: 'back' | 'home') => {
      setIncoming(null);
      setQueuedPeerName(DEFAULT_RECEIVER_NAME);
      setQueuedPeerImage(null);
      void (async () => {
        try {
          await setQueueMode(false);
        } catch {
          // ignore
        } finally {
          if (mode === 'back') {
            navigation.goBack();
          } else {
            navigation.navigate('CallerDiscover');
          }
        }
      })();
    },
    [navigation, setQueueMode]
  );

  useEffect(() => {
    const id = setInterval(() => {
      setHintIdx((prev) => (prev + 1) % WAITING_HINTS.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    void setQueueMode(true).catch(() => {});
    setIncomingCallHandler((req) => {
      setIncoming(req);
      setJoining(true);
      void (async () => {
        try {
          await acceptIncomingCall(req);
          if (mounted) setIncoming(null);
        } catch (e: unknown) {
          if (mounted) {
            setJoining(false);
            setIncoming(null);
            setQueuedPeerName(DEFAULT_RECEIVER_NAME);
            setQueuedPeerImage(null);
            Alert.alert('Call failed', getErrorMessage(e));
          }
        }
      })();
    });
    return () => {
      mounted = false;
      setIncomingCallHandler(null);
      void setQueueMode(false).catch(() => {});
    };
  }, [acceptIncomingCall, setIncomingCallHandler, setQueueMode]);

  useEffect(() => {
    if (!peerId || invitedRef.current) return;
    invitedRef.current = true;
    setCalling(true);
    void (async () => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < QUEUE_WAIT_MS) {
        try {
          await startCallInvite(peerId, peerName, peerImage);
          return;
        } catch (e: unknown) {
          const msg = getErrorMessage(e).toLowerCase();
          const retriable =
            msg.includes('waiting queue') ||
            msg.includes('not available in queue right now') ||
            msg.includes('not available right now');
          if (!retriable) {
            Alert.alert('Call failed', getErrorMessage(e));
            navigation.goBack();
            return;
          }
          setQueuedPeerName(DEFAULT_RECEIVER_NAME);
          setQueuedPeerImage(null);
          setIncoming(null);
          const elapsed = Date.now() - startedAt;
          const left = Math.max(0, Math.ceil((QUEUE_WAIT_MS - elapsed) / 1000));
          setWaitLeftSec(left);
          await sleep(RETRY_DELAY_MS);
        }
      }
      Alert.alert('Call unavailable', 'No receiver found. Try again after some time.');
      navigation.goBack();
    })()
      .finally(() => {
        setCalling(false);
      });
  }, [navigation, peerId, peerImage, peerName, startCallInvite]);

  useEffect(() => {
    if (peerId || invitedRef.current) return;
    invitedRef.current = true;
    setCalling(true);
    void (async () => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < QUEUE_WAIT_MS) {
        try {
          const { data } = await callApi.randomReceiver();
          setQueuedPeerName(data.name || 'Receiver');
          setQueuedPeerImage(data.profileImage ?? null);
          await startCallInvite(data.receiverId, data.name, data.profileImage ?? null);
          return;
        } catch (e: unknown) {
          const msg = getErrorMessage(e).toLowerCase();
          const retriable =
            msg.includes('waiting queue') ||
            msg.includes('not available in queue right now') ||
            msg.includes('not available right now') ||
            msg.includes('no queued receivers');
          if (!retriable) {
            Alert.alert('Call failed', getErrorMessage(e));
            navigation.goBack();
            return;
          }
          setQueuedPeerName(DEFAULT_RECEIVER_NAME);
          setQueuedPeerImage(null);
          setIncoming(null);
          const elapsed = Date.now() - startedAt;
          const left = Math.max(0, Math.ceil((QUEUE_WAIT_MS - elapsed) / 1000));
          setWaitLeftSec(left);
          await sleep(RETRY_DELAY_MS);
        }
      }
      Alert.alert('Call unavailable', 'No receiver found. Try again after some time.');
      navigation.goBack();
    })()
      .finally(() => {
        setCalling(false);
      });
  }, [navigation, peerId, startCallInvite]);

  const goOffline = useCallback(() => {
    setMenuOpen(false);
    exitQueue('home');
  }, [exitQueue]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => exitQueue('back')}>
            <Text style={styles.backTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Call Queue</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => setMenuOpen(true)}>
            <Text style={styles.menuDots}>⋯</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>
          {incoming || joining
            ? `${shownPeerName} is connecting...`
            : calling
              ? `Waiting for ${shownPeerName}...`
              : 'Waiting for receiver...'}
        </Text>
        <Text style={styles.subtitle}>
          {incoming || joining
            ? 'Auto-joining the voice call...'
            : calling
              ? `Waiting up to 1 minute (${waitLeftSec}s left).`
              : 'Stay on this screen. Call will start when both sides are in queue.'}
        </Text>
        {!incoming && !joining ? <Text style={styles.hint}>{WAITING_HINTS[hintIdx]}</Text> : null}

        {!incoming ? <ActivityIndicator size="small" color="#22c55e" style={styles.loader} /> : null}

        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            {user?.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPh}>
                <Text style={styles.initial}>{selfInitial}</Text>
              </View>
            )}
            <Text style={styles.avatarName}>{selfName}</Text>
          </View>

          <View style={styles.avatarWrap}>
            {shownPeerImage ? (
              <Image source={{ uri: shownPeerImage }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPh}>
                <Text style={styles.initial}>{peerInitial}</Text>
              </View>
            )}
            <Text style={styles.avatarName}>{shownPeerName}</Text>
          </View>
        </View>

        <View style={styles.audioCard}>
          <View style={styles.audioRow}>
            <Text style={styles.audioLabel}>Bluetooth Mic</Text>
            <TouchableOpacity
              style={[styles.togglePill, bluetoothMic && styles.togglePillOn]}
              onPress={() => setBluetoothMic((x) => !x)}
            >
              <Text style={[styles.toggleTxt, bluetoothMic && styles.toggleTxtOn]}>
                {bluetoothMic ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.audioRow}>
            <Text style={styles.audioLabel}>Speaker</Text>
            <TouchableOpacity
              style={[styles.togglePill, speakerOn && styles.togglePillOn]}
              onPress={() => setSpeakerOn((x) => !x)}
            >
              <Text style={[styles.toggleTxt, speakerOn && styles.toggleTxtOn]}>
                {speakerOn ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {joining ? <Text style={styles.joiningText}>Joining call...</Text> : null}
      </View>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.menuItem} onPress={goOffline}>
              <Text style={styles.menuItemText}>Go Offline</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b1120' },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  backTxt: { color: '#cbd5e1', fontSize: 22, fontWeight: '700', marginTop: -2 },
  menuDots: { color: '#cbd5e1', fontSize: 22, fontWeight: '800', marginTop: -8 },
  headerTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 10 },
  subtitle: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  hint: { color: '#cbd5e1', fontSize: 13, textAlign: 'center', marginTop: 8, fontWeight: '600' },
  loader: { marginTop: 12 },
  avatarRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 30 },
  avatarWrap: { width: 132, alignItems: 'center' },
  avatar: { width: 112, height: 112, borderRadius: 56, borderWidth: 4, borderColor: '#22c55e' },
  avatarPh: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 4,
    borderColor: '#22c55e',
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: '#f8fafc', fontSize: 34, fontWeight: '800' },
  avatarName: { marginTop: 10, color: '#e2e8f0', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  audioCard: {
    marginTop: 34,
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 14,
    gap: 10,
  },
  audioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  audioLabel: { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
  togglePill: {
    minWidth: 60,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  togglePillOn: { borderColor: '#22c55e', backgroundColor: '#052e16' },
  toggleTxt: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  toggleTxtOn: { color: '#86efac' },
  joiningText: { marginTop: 20, color: '#86efac', textAlign: 'center', fontWeight: '700' },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 78,
    paddingRight: 16,
  },
  menuCard: {
    width: 170,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 12 },
  menuItemText: { color: '#fca5a5', fontSize: 14, fontWeight: '700' },
});
