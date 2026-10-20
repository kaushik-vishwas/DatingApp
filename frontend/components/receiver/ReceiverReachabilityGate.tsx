import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReachabilityCheckId, ReachabilityStatus } from '../../utils/receiverReachability';

type Props = {
  visible: boolean;
  status: ReachabilityStatus | null;
  missing: ReachabilityCheckId[];
  busy?: boolean;
  busyId?: ReachabilityCheckId | null;
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

const ICONS: Record<ReachabilityCheckId, React.ComponentProps<typeof Ionicons>['name']> = {
  notifications: 'notifications-outline',
  battery: 'battery-charging-outline',
  fullScreenIntent: 'phone-portrait-outline',
  pushToken: 'call-outline',
  autostart: 'rocket-outline',
};

export default function ReceiverReachabilityGate({
  visible,
  missing,
  busy,
  busyId,
  onFix,
  onAcknowledgeAutostart,
  onClose,
}: Props): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <LinearGradient
          colors={['#3b0d7a', '#6d28d9', '#9333ea']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.headerIcon}>
            <Ionicons name="call" size={26} color="#fff" />
          </View>
          <Text style={styles.title}>Don't miss calls</Text>
          <Text style={styles.sub}>Enable these to receive calls reliably.</Text>
          {missing.map((id) => (
            <View key={id} style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name={ICONS[id]} size={18} color="#fff" />
              </View>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {LABELS[id]}
              </Text>
              <View style={styles.rowActions}>
                {id === 'autostart' ? (
                  <TouchableOpacity style={styles.doneBtn} onPress={onAcknowledgeAutostart} disabled={busy}>
                    <Text style={styles.doneText}>Done</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.allowBtn} onPress={() => onFix(id)} disabled={busy}>
                  {busyId === id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.allowText}>Allow</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={10}>
            <Text style={styles.cancel}>Not now</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,0,20,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4, textAlign: 'center' },
  sub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 16,
    textAlign: 'center',
  },
  row: {
    alignSelf: 'stretch',
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#fff' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allowBtn: {
    width: 72,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allowText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  doneBtn: {
    width: 60,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancel: {
    textAlign: 'center',
    marginTop: 8,
    paddingVertical: 6,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
  },
});
