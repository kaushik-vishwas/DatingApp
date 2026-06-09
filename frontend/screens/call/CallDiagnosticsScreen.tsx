import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import {
  clearCallDiagnostics,
  formatCallDiagnosticsForExport,
  getCallDiagnosticEntries,
  getCallDiagnosticsDeviceSummary,
  getCallDiagnosticsSnapshot,
  subscribeCallDiagnostics,
} from '../../utils/callDiagnostics';

type Props =
  | NativeStackScreenProps<CallerStackParamList, 'CallDiagnostics'>
  | NativeStackScreenProps<ReceiverStackParamList, 'CallDiagnostics'>;

export default function CallDiagnosticsScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((n) => n + 1), []);

  React.useEffect(() => subscribeCallDiagnostics(refresh), [refresh]);

  const entries = getCallDiagnosticEntries();
  const snapshot = getCallDiagnosticsSnapshot();
  const device = getCallDiagnosticsDeviceSummary();

  const snapshotLines = useMemo(
    () => [
      `Call ID: ${snapshot.callId ?? '—'}`,
      `Role: ${snapshot.userRole ?? '—'}`,
      `Ready: ${snapshot.ready}`,
      `Talk active: ${snapshot.talkActive}`,
      `Ending: ${snapshot.ending}`,
      `System hold: ${snapshot.systemCallHold}`,
      `Peer hold: ${snapshot.peerCallHold}`,
      `Hold guard: ${snapshot.holdGraceActive}`,
      `App background: ${snapshot.appInBackground}`,
      `Stream state: ${snapshot.streamCallingState ?? '—'}`,
      `Remote participants: ${snapshot.remoteParticipantCount ?? '—'}`,
    ],
    [snapshot]
  );

  const onCopy = async (): Promise<void> => {
    try {
      const text = formatCallDiagnosticsForExport();
      await Share.share({ message: text, title: 'Call diagnostics' });
    } catch (e) {
      Alert.alert('Copy failed', e instanceof Error ? e.message : String(e));
    }
  };

  const onExport = async (): Promise<void> => {
    try {
      const text = formatCallDiagnosticsForExport();
      const baseDir =
        (FileSystem as { cacheDirectory?: string | null }).cacheDirectory ??
        (FileSystem as { documentDirectory?: string | null }).documentDirectory;
      if (!baseDir) {
        throw new Error('No writable directory available');
      }
      const path = `${baseDir}call-diagnostics-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(path, text);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/json',
          dialogTitle: 'Export call diagnostics',
        });
      } else {
        await Share.share({ url: path, message: text });
      }
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const onClear = (): void => {
    Alert.alert('Clear logs?', 'This removes in-memory diagnostics for this session.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearCallDiagnostics();
          refresh();
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Call diagnostics</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Device</Text>
        <View style={styles.card}>
          {Object.entries(device).map(([k, v]) => (
            <Text key={k} style={styles.line}>
              {k}: {v}
            </Text>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Live call state</Text>
        <View style={styles.card}>
          {snapshotLines.map((line) => (
            <Text key={line} style={styles.line}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void onCopy()}>
            <Text style={styles.actionText}>Copy logs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void onExport()}>
            <Text style={styles.actionText}>Export logs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.clearBtn]} onPress={onClear}>
            <Text style={styles.actionText}>Clear logs</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Event log ({entries.length})</Text>
        {entries.length === 0 ? (
          <Text style={styles.empty}>No events captured yet.</Text>
        ) : (
          entries.map((e) => (
            <View key={e.id} style={styles.logRow}>
              <Text style={styles.logTime}>{e.timestamp}</Text>
              <Text style={styles.logType}>{e.eventType}</Text>
              <Text style={styles.logDetail} numberOfLines={4}>
                {JSON.stringify(e.details)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0a1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.25)',
  },
  backBtn: { minWidth: 72 },
  backText: { color: '#c4b5fd', fontWeight: '700' },
  title: { color: '#faf5ff', fontSize: 16, fontWeight: '800' },
  scroll: { padding: 14, paddingBottom: 40 },
  sectionTitle: {
    color: '#e9d5ff',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: 'rgba(76,29,149,0.35)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },
  line: { color: '#ede9fe', fontSize: 12, marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 14 },
  actionBtn: {
    backgroundColor: '#6d28d9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  clearBtn: { backgroundColor: '#7f1d1d' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  empty: { color: '#a78bfa', fontSize: 12 },
  logRow: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(30,11,61,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
  },
  logTime: { color: '#a78bfa', fontSize: 10 },
  logType: { color: '#faf5ff', fontWeight: '800', fontSize: 12, marginVertical: 2 },
  logDetail: { color: '#ddd6fe', fontSize: 11 },
});
