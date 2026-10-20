import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReachabilityCheckId, ReachabilityStatus } from '../../utils/receiverReachability';

type Props = {
  visible: boolean;
  status: ReachabilityStatus | null;
  missing: ReachabilityCheckId[];
  busy?: boolean;
  onFix: (id: ReachabilityCheckId) => void;
  onAcknowledgeAutostart: () => void;
  onRetry: () => void;
  onClose: () => void;
};

const LABELS: Record<ReachabilityCheckId, string> = {
  notifications: 'Notifications',
  battery: 'Battery – no restrictions',
  fullScreenIntent: 'Full-screen calls',
  pushToken: 'Call alerts',
  autostart: 'Autostart',
};

export default function ReceiverReachabilityGate({
  visible,
  missing,
  busy,
  onFix,
  onAcknowledgeAutostart,
  onClose,
}: Props): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Don't miss calls</Text>
          <Text style={styles.sub}>Enable these to receive calls reliably.</Text>
          {missing.map((id) => (
            <View key={id} style={styles.row}>
              <Text style={styles.rowTitle}>{LABELS[id]}</Text>
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.allowBtn} onPress={() => onFix(id)} disabled={busy}>
                  <Text style={styles.allowText}>Allow</Text>
                </TouchableOpacity>
                {id === 'autostart' ? (
                  <TouchableOpacity style={styles.doneBtn} onPress={onAcknowledgeAutostart} disabled={busy}>
                    <Text style={styles.doneText}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={10}>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 4 },
  sub: { fontSize: 13, color: '#71717a', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#18181b' },
  rowActions: { flexDirection: 'row', gap: 6 },
  allowBtn: {
    backgroundColor: '#7B2CFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  allowText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  doneBtn: {
    backgroundColor: '#F1E9FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  doneText: { color: '#7B2CFF', fontWeight: '700', fontSize: 13 },
  cancel: { textAlign: 'center', marginTop: 14, color: '#71717a', fontWeight: '600' },
});
