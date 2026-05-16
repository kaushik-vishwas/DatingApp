import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { getErrorMessage, walletApi } from '../../services/api';
import type { CallerWalletTopupRow } from '../../types/api';
import { buildWalletTopupInvoiceHtml } from '../../utils/walletInvoiceHtml';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<CallerStackParamList, 'WalletTransactions'>;

function formatDt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function WalletTransactionsScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [rows, setRows] = useState<CallerWalletTopupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    try {
      const { data } = await walletApi.listTopups();
      setRows(data.topups);
    } catch (e: unknown) {
      Alert.alert('Could not load transactions', getErrorMessage(e));
      if (mode === 'initial') setRows([]);
    } finally {
      if (mode === 'initial') setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const onDownloadInvoice = async (row: CallerWalletTopupRow) => {
    setDownloadingId(row.id);
    try {
      const html = buildWalletTopupInvoiceHtml(row, { customerName: user?.name ?? 'Customer' });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Wallet invoice',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Invoice PDF:\n${uri}`);
      }
    } catch (e: unknown) {
      Alert.alert('Invoice failed', getErrorMessage(e));
    } finally {
      setDownloadingId(null);
    }
  };

  const renderItem = ({ item }: { item: CallerWalletTopupRow }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.cardTitle}>Wallet recharge</Text>
          <Text style={styles.cardDate}>{formatDt(item.createdAt)}</Text>
        </View>
        <Text style={styles.cardCredit}>+₹{item.creditAdded.toLocaleString('en-IN')}</Text>
      </View>
      <Text style={styles.cardLine}>Paid ₹{item.payAmount.toLocaleString('en-IN')} • Bonus {item.bonusPercent}%</Text>
      <Text style={styles.cardSub} numberOfLines={1}>
        Order {item.razorpayOrderId.slice(0, 14)}…
      </Text>
      <TouchableOpacity
        style={styles.invoiceBtn}
        onPress={() => void onDownloadInvoice(item)}
        disabled={downloadingId === item.id}
        activeOpacity={0.85}
      >
        {downloadingId === item.id ? (
          <ActivityIndicator size="small" color={PURPLE} />
        ) : (
          <Text style={styles.invoiceBtnText}>Download invoice (PDF)</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Transactions</Text>
        <View style={styles.back} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PURPLE} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Math.max(insets.bottom, 20) + 12 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={PURPLE} />
          }
          ListEmptyComponent={<Text style={styles.empty}>No wallet top-ups yet.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  back: { width: 36, padding: 6 },
  backTxt: { fontSize: 22 },
  title: { fontSize: 18, fontWeight: '900', color: '#111' },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', color: '#888', marginTop: 36, fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  cardDate: { fontSize: 12, color: '#888', marginTop: 4 },
  cardCredit: { fontSize: 17, fontWeight: '900', color: PURPLE },
  cardLine: { fontSize: 12, color: '#555', marginBottom: 4 },
  cardSub: { fontSize: 11, color: '#aaa' },
  invoiceBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  invoiceBtnText: { fontSize: 13, fontWeight: '800', color: PURPLE },
});
