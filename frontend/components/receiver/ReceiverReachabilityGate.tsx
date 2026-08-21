import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReachabilityCheckId, ReachabilityStatus } from '../../utils/receiverReachability';

type Props = {
  visible: boolean;
  status: ReachabilityStatus | null;
  missing: ReachabilityCheckId[];
  busy?: boolean;
  onFix: (id: ReachabilityCheckId) => void;
  onRetry: () => void;
  onClose: () => void;
};

const LABELS: Record<ReachabilityCheckId, { title: string; body: string }> = {
  notifications: {
    title: 'Allow notifications',
    body: 'Incoming calls need notification permission.',
  },
  battery: {
    title: 'Unrestricted battery',
    body: 'Turn off battery optimization so calls still ring after the phone sits idle.',
  },
  fullScreenIntent: {
    title: 'Full-screen incoming calls',
    body: 'Allow Selecto to show calls over the lock screen (Android 14+).',
  },
  pushToken: {
    title: 'Call alerts not registered',
    body: 'We could not save a push token. Check Google Play services and try again.',
  },
};

export default function ReceiverReachabilityGate({
  visible,
  status,
  missing,
  busy,
  onFix,
  onRetry,
  onClose,
}: Props): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Stay reachable for calls</Text>
          <Text style={styles.sub}>
            Complete these so callers can reach you after the app is backgrounded for 20+ minutes.
          </Text>
          {missing.map((id) => (
            <View key={id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{LABELS[id].title}</Text>
                <Text style={styles.rowBody}>{LABELS[id].body}</Text>
              </View>
              <TouchableOpacity style={styles.fixBtn} onPress={() => onFix(id)} disabled={busy}>
                <Text style={styles.fixText}>Fix</Text>
              </TouchableOpacity>
            </View>
          ))}
          {status?.oemHint ? <Text style={styles.hint}>{status.oemHint}</Text> : null}
          <TouchableOpacity style={styles.primary} onPress={onRetry} disabled={busy}>
            <Text style={styles.primaryText}>{busy ? 'Checking…' : 'I fixed this — continue'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} disabled={busy}>
            <Text style={styles.cancel}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 6 },
  sub: { fontSize: 13, color: '#52525b', marginBottom: 14, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e4e4e7',
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#18181b' },
  rowBody: { fontSize: 12, color: '#71717a', marginTop: 2 },
  fixBtn: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  fixText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  hint: {
    marginTop: 12,
    fontSize: 12,
    color: '#7c3aed',
    lineHeight: 17,
  },
  primary: {
    marginTop: 16,
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '800' },
  cancel: { textAlign: 'center', marginTop: 12, color: '#71717a', fontWeight: '600' },
});
