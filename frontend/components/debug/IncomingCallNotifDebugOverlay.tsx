import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isIncomingCallNotifDebugBuild } from '../../utils/incomingCallNotificationDebug';
import {
  captureIncomingCallNotifSnapshot,
  clearIncomingCallNotifDebugLog,
  getIncomingCallNotifDebugLogPath,
  shareIncomingCallNotifDebugLog,
} from '../../utils/incomingCallNotificationFileDebug';

function IncomingCallNotifDebugOverlayInner(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onShare = async (): Promise<void> => {
    setBusy(true);
    try {
      await captureIncomingCallNotifSnapshot('user_tap_share', { from: 'debug_overlay' });
      const result = await shareIncomingCallNotifDebugLog();
      Alert.alert(result.ok ? 'Thank you' : 'Could not share', result.message);
    } finally {
      setBusy(false);
    }
  };

  const onClear = (): void => {
    Alert.alert('Clear log?', 'This removes saved notification tap history on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void clearIncomingCallNotifDebugLog();
        },
      },
    ]);
  };

  return (
    <>
      <Pressable
        style={[styles.fab, { bottom: 12 + insets.bottom }]}
        onPress={() => setOpen(true)}
        accessibilityLabel="Open notification debug help"
      >
        <Text style={styles.fabText}>Debug report</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.title}>Notification test build</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.body}>
              Help us fix Samsung call notification taps. After you reproduce the issue, tap{' '}
              <Text style={styles.bold}>Send report</Text> and share the file with Nestham support
              (WhatsApp, Gmail, or email).
            </Text>
            <Text style={styles.section}>Steps</Text>
            <Text style={styles.step}>1. Install this debug APK (not the normal Play Store app).</Text>
            <Text style={styles.step}>2. Receive a test call with the app in the background.</Text>
            <Text style={styles.step}>
              3. Try the small popup (compact) tap — note if Incoming Call opens.
            </Text>
            <Text style={styles.step}>
              4. Open the notification shade, expand the call row, tap the title/body area (not only
              Open).
            </Text>
            <Text style={styles.step}>
              5. Open this screen and tap Send report. The log records overlay vs Open button taps
              (native.tap_relayed) and whether overlays were applied (show.tap_enhance).
            </Text>
            <Text style={styles.hint}>
              Log file: {getIncomingCallNotifDebugLogPath()}
            </Text>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={styles.btnPrimary} onPress={() => void onShare()} disabled={busy}>
              <Text style={styles.btnPrimaryText}>{busy ? 'Preparing…' : 'Send report'}</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={onClear}>
              <Text style={styles.btnSecondaryText}>Clear log</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={() => setOpen(false)}>
              <Text style={styles.btnGhostText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 12,
    zIndex: 9999,
    backgroundColor: '#5b21b6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  sheet: { flex: 1, backgroundColor: '#faf5ff', paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#1f2937', marginBottom: 12 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  body: { fontSize: 16, lineHeight: 24, color: '#374151', marginBottom: 16 },
  bold: { fontWeight: '700' },
  section: { fontSize: 17, fontWeight: '700', color: '#5b21b6', marginBottom: 8 },
  step: { fontSize: 15, lineHeight: 22, color: '#4b5563', marginBottom: 8 },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 12 },
  actions: { gap: 10 },
  btnPrimary: {
    backgroundColor: '#5b21b6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnSecondary: {
    backgroundColor: '#e9d5ff',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#5b21b6', fontWeight: '600' },
  btnGhost: { paddingVertical: 10, alignItems: 'center' },
  btnGhostText: { color: '#6b7280', fontWeight: '600' },
});

/** Shown only on notification-debug APK builds. Does not appear in production. */
export default function IncomingCallNotifDebugOverlay(): React.JSX.Element | null {
  if (!isIncomingCallNotifDebugBuild()) {
    return null;
  }
  return <IncomingCallNotifDebugOverlayInner />;
}
