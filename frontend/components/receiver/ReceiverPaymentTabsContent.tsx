import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useReceiverNotificationData } from '../../context/ReceiverNotificationDataContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import ReceiverNotificationActivityList from './ReceiverNotificationActivityList';

type PaymentSubTab = 'earning' | 'withdrawal';
const PAYMENT_RELOAD_THROTTLE_MS = 12_000;

export default function ReceiverPaymentTabsContent(): React.JSX.Element {
  const navigation = useNavigation();
  const stackNavigation = useMemo(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<ReceiverStackParamList>>();
    if (parent) return parent;
    return navigation as NativeStackNavigationProp<ReceiverStackParamList>;
  }, [navigation]);
  const { reload } = useReceiverNotificationData();
  const [subTab, setSubTab] = useState<PaymentSubTab>('earning');
  const lastReloadAtRef = React.useRef(0);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastReloadAtRef.current < PAYMENT_RELOAD_THROTTLE_MS) return;
      lastReloadAtRef.current = now;
      void reload();
    }, [reload])
  );

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, subTab === 'earning' && styles.tabActive]}
          onPress={() => setSubTab('earning')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, subTab === 'earning' && styles.tabTextActive]}>Earnings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, subTab === 'withdrawal' && styles.tabActive]}
          onPress={() => setSubTab('withdrawal')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, subTab === 'withdrawal' && styles.tabTextActive]}>Withdrawals</Text>
        </TouchableOpacity>
      </View>

      {subTab === 'earning' ? (
        <ReceiverNotificationActivityList
          types={['earning']}
          emptyLabel="No earnings activity yet."
          showEarningActions
        />
      ) : (
        <ReceiverNotificationActivityList
          types={['withdrawal']}
          emptyLabel="No withdrawal activity yet."
          headerExtra={
            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => stackNavigation.navigate('WithdrawEarnings')}
              activeOpacity={0.88}
            >
              <Text style={styles.withdrawBtnText}>Withdraw earnings</Text>
            </TouchableOpacity>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  tabActive: { backgroundColor: '#7b2cff', borderColor: '#7b2cff' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#444' },
  tabTextActive: { color: '#fff' },
  withdrawBtn: {
    backgroundColor: '#7b2cff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  withdrawBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
