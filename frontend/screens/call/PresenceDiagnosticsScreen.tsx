import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import {
  analyzePresenceLog,
  clearPresenceDiagnostics,
  getLastPresenceFailure,
  getPresenceDiagnosticEntries,
  getPresenceIssueCount,
  hydratePresenceDiagnostics,
  ingestNativePresenceWakeLog,
  subscribePresenceDiagnostics,
} from '../../utils/receiverPresenceDiagnostics';
import { buildPresenceDiagnosticsExport, collectPresenceEnvironmentSnapshot } from '../../utils/presenceDiagnosticsSnapshot';
import { copySuccessMessage, copyTextToClipboard } from '../../utils/copyToClipboard';

type Props =
  | NativeStackScreenProps<CallerStackParamList, 'PresenceDiagnostics'>
  | NativeStackScreenProps<ReceiverStackParamList, 'PresenceDiagnostics'>;

const FCM_EVENT_RE =
  /fcm|push_token|keep_alive|keepalive|incoming_|bg_task|native_|reachability|environment_snapshot/i;

export default function PresenceDiagnosticsScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [, bump] = useState(0);
  const [whyLines, setWhyLines] = useState<string[]>(['Loading FCM / wake status…']);
  const [copyBusy, setCopyBusy] = useState(false);
  const refresh = useCallback(() => bump((n) => n + 1), []);

  const loadSnapshot = useCallback(async (): Promise<void> => {
    try {
      await ingestNativePresenceWakeLog();
      const snap = await collectPresenceEnvironmentSnapshot();
      const lines = Array.isArray(snap.fcmWhyNotWorking)
        ? (snap.fcmWhyNotWorking as string[])
        : ['No FCM verdict produced.'];
      setWhyLines(lines);
      refresh();
    } catch (e) {
      setWhyLines([`Snapshot failed: ${e instanceof Error ? e.message : String(e)}`]);
    }
  }, [refresh]);

  React.useEffect(() => {
    void hydratePresenceDiagnostics()
      .then(() => loadSnapshot())
      .then(refresh);
    return subscribePresenceDiagnostics(refresh);
  }, [loadSnapshot, refresh]);

  const entries = getPresenceDiagnosticEntries();
  const lastFailure = getLastPresenceFailure();
  const issueCount = getPresenceIssueCount();
  const analysis = analyzePresenceLog();
  const focusedEntries = entries.filter((e) => FCM_EVENT_RE.test(e.event)).slice(-40);

  const onCopyAll = async (): Promise<void> => {
    if (copyBusy) return;
    setCopyBusy(true);
    try {
      await ingestNativePresenceWakeLog();
      const text = await buildPresenceDiagnosticsExport();
      const result = await copyTextToClipboard(text);
      Alert.alert('Copied', copySuccessMessage(result));
      await loadSnapshot();
    } catch (e) {
      Alert.alert('Copy failed', e instanceof Error ? e.message : String(e));
    } finally {
      setCopyBusy(false);
    }
  };

  const onClear = (): void => {
    Alert.alert('Clear debug logs?', 'Removes stored presence / FCM diagnostic entries.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void clearPresenceDiagnostics()
            .then(() => loadSnapshot())
            .then(refresh);
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
        <Text style={styles.title}>FCM / wake debug</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity
          style={[styles.copyAllBtn, copyBusy ? styles.copyBusy : null]}
          onPress={() => void onCopyAll()}
          disabled={copyBusy}
          activeOpacity={0.9}
        >
          <Text style={styles.copyAllText}>{copyBusy ? 'Copying…' : 'Copy all debug logs'}</Text>
          <Text style={styles.copyAllSub}>FCM status · device · wake events · full JSON</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Why FCM / wake may not work</Text>
          {whyLines.map((line, idx) => (
            <Text key={`${idx}-${line.slice(0, 24)}`} style={styles.whyLine}>
              • {line}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.line}>Issues: {issueCount}</Text>
          <Text style={styles.line}>
            Last failure:{' '}
            {lastFailure ? `${lastFailure.event} — ${String(lastFailure.details.reason ?? '')}` : 'none'}
          </Text>
          <Text style={styles.line}>
            Native FCM presents: {analysis.nativeFcmPresentCount} · keep-alive destroyed:{' '}
            {analysis.nativeKeepAliveDestroyedCount}
          </Text>
          <Text style={styles.line}>JS likely killed: {analysis.likelyJsKilled ? 'yes' : 'no'}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void loadSnapshot()}>
            <Text style={styles.actionText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.clearBtn]} onPress={onClear}>
            <Text style={styles.actionText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Recent FCM / wake events</Text>
        {focusedEntries.length === 0 ? (
          <Text style={styles.empty}>
            No FCM / wake events yet. Go Online, then wait for a missed call or push-token refresh —
            failures appear here.
          </Text>
        ) : (
          [...focusedEntries].reverse().map((e) => (
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
              <Text style={styles.logDetail} numberOfLines={8}>
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
  copyAllBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  copyBusy: { opacity: 0.7 },
  copyAllText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  copyAllSub: { color: '#fee2e2', fontSize: 11, textAlign: 'center', marginTop: 4, fontWeight: '600' },
  card: {
    backgroundColor: 'rgba(127,29,29,0.45)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    marginBottom: 12,
  },
  cardTitle: { color: '#fff1f2', fontWeight: '900', fontSize: 13, marginBottom: 8 },
  whyLine: { color: '#fecaca', fontSize: 12, marginBottom: 6, lineHeight: 17 },
  line: { color: '#fecaca', fontSize: 12, marginBottom: 4 },
  sectionTitle: {
    color: '#fecaca',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 8,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
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
});
