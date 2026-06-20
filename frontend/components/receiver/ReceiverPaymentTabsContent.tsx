import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useReceiverNotificationData } from '../../context/ReceiverNotificationDataContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import ReceiverNotificationActivityList from './ReceiverNotificationActivityList';
import ReceiverSwipeableTabs from './ReceiverSwipeableTabs';

type PaymentSubTab = 'earning' | 'withdrawal';
const PAYMENT_RELOAD_THROTTLE_MS = 12_000;
const PAYMENT_TABS = [
  { key: 'earning' as const, label: 'Earnings' },
  { key: 'withdrawal' as const, label: 'Withdrawals' },
];

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

  const renderPaymentPage = useCallback(
    (tab: PaymentSubTab): React.JSX.Element => {
      if (tab === 'earning') {
        return (
          <ReceiverNotificationActivityList
            types={['earning']}
            emptyLabel="No earnings activity yet."
            showEarningActions
          />
        );
      }

      return (
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
      );
    },
    [stackNavigation]
  );

  return (
    <View style={styles.root}>
      <ReceiverSwipeableTabs
        tabs={PAYMENT_TABS}
        activeTab={subTab}
        onTabChange={setSubTab}
        tabBarStyle={styles.tabs}
        tabButtonStyle={styles.tab}
        tabButtonActiveStyle={styles.tabActive}
        tabTextStyle={styles.tabText}
        tabTextActiveStyle={styles.tabTextActive}
        renderPage={renderPaymentPage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: {
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
