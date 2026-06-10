import React, { useCallback, useState } from 'react';
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
  clearPresenceDiagnostics,
  formatPresenceDiagnosticsForExport,
  getLastPresenceFailure,
  getPresenceDiagnosticEntries,
  getPresenceIssueCount,
  hydratePresenceDiagnostics,
  subscribePresenceDiagnostics,
} from '../../utils/receiverPresenceDiagnostics';

type Props =
  | NativeStackScreenProps<CallerStackParamList, 'PresenceDiagnostics'>
  | NativeStackScreenProps<ReceiverStackParamList, 'PresenceDiagnostics'>;

export default function PresenceDiagnosticsScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((n) => n + 1), []);

  React.useEffect(() => {
    void hydratePresenceDiagnostics().then(refresh);
    return subscribePresenceDiagnostics(refresh);
  }, [refresh]);

  const entries = getPresenceDiagnosticEntries();
  const lastFailure = getLastPresenceFailure();
  const issueCount = getPresenceIssueCount();

  const onExport = async (): Promise<void> => {
    try {
      const text = formatPresenceDiagnosticsForExport();
      const baseDir =
        (FileSystem as { cacheDirectory?: string | null }).cacheDirectory ??
        (FileSystem as { documentDirectory?: string | null }).documentDirectory;
      if (!baseDir) throw new Error('No writable directory');
      const path = `${baseDir}presence-diagnostics-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(path, text);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/json',
          dialogTitle: 'Export presence diagnostics',
        });
      } else {
        await Share.share({ message: text });
      }
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const onClear = (): void => {
    Alert.alert('Clear presence logs?', 'This removes all presence diagnostic entries.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void clearPresenceDiagnostics().then(refresh);
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
        <Text style={styles.title}>Presence logs</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.line}>Issues: {issueCount}</Text>
          <Text style={styles.line}>Entries: {entries.length}</Text>
          <Text style={styles.line}>
            Last failure: {lastFailure ? `${lastFailure.event} — ${String(lastFailure.details.reason ?? '')}` : 'none'}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void onExport()}>
            <Text style={styles.actionText}>Export JSON</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.clearBtn]} onPress={onClear}>
            <Text style={styles.actionText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Event log</Text>
        {entries.length === 0 ? (
          <Text style={styles.empty}>
            No presence logs yet. Minimize the receiver app while Go Online is on — failures will
            appear here with the exact reason discover/calls showed offline.
          </Text>
        ) : (
          [...entries].reverse().map((e) => (
            <View
              key={e.id}
              style={[
                styles.logRow,
                e.level === 'error' ? styles.errorRow : e.level === 'warn' ? styles.warnRow : null,
              ]}
            >
              <Text style={styles.logTime}>{e.at}</Text>
              <Text style={styles.logType}>
                [{e.level}] {e.event}
              </Text>
              <Text style={styles.logDetail} numberOfLines={10}>
                {JSON.stringify(e.details)}
              </Text>
              <Text style={styles.logMeta}>
                appState={e.appState} api={e.androidApi ?? 'n/a'} {e.deviceBrand} {e.deviceModel}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a0505' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,113,113,0.25)',
  },
  backBtn: { minWidth: 72 },
  backText: { color: '#fecaca', fontWeight: '700' },
  title: { color: '#fff1f2', fontSize: 16, fontWeight: '800' },
  scroll: { padding: 14, paddingBottom: 40 },
  card: {
    backgroundColor: 'rgba(127,29,29,0.45)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
  },
  line: { color: '#fecaca', fontSize: 12, marginBottom: 4 },
  sectionTitle: {
    color: '#fecaca',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 8,
  },
  actions: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  actionBtn: {
    backgroundColor: '#b91c1c',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  clearBtn: { backgroundColor: '#7f1d1d' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  empty: { color: '#fca5a5', fontSize: 12 },
  logRow: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(69,10,10,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.2)',
  },
  errorRow: { borderColor: 'rgba(239,68,68,0.7)' },
  warnRow: { borderColor: 'rgba(251,191,36,0.55)' },
  logTime: { color: '#fca5a5', fontSize: 10 },
  logType: { color: '#fff1f2', fontWeight: '800', fontSize: 12, marginVertical: 2 },
  logDetail: { color: '#fecaca', fontSize: 11 },
  logMeta: { color: '#f87171', fontSize: 10, marginTop: 4 },
});
