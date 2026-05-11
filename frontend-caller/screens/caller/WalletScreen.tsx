import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { WALLET_PACKAGES, creditForPackage, type WalletPackage } from '../../constants/walletPackages';
import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<CallerStackParamList, 'Wallet'>;

export default function WalletScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [selected, setSelected] = useState<WalletPackage | null>(null);

  const bal = typeof user?.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;

  const onProceed = () => {
    if (!selected) {
      Alert.alert('Select amount', 'Choose a recharge pack to continue.');
      return;
    }
    const credit = creditForPackage(selected);
    navigation.navigate('PaymentMethod', {
      payAmount: selected.pay,
      bonusPercent: selected.bonus,
      creditAmount: credit,
    });
  };

  const renderPkg = ({ item }: { item: WalletPackage }) => {
    const active = selected?.pay === item.pay && selected?.bonus === item.bonus;
    const credit = creditForPackage(item);
    return (
      <TouchableOpacity
        style={[styles.pkg, active && styles.pkgActive]}
        onPress={() => setSelected(item)}
        activeOpacity={0.9}
      >
        {item.popular ? (
          <View style={styles.popular}>
            <Text style={styles.popularTxt}>Popular</Text>
          </View>
        ) : null}
        <Text style={styles.pkgPay}>₹ {item.pay}</Text>
        <Text style={styles.pkgBonus}>+{item.bonus}% Extra</Text>
        <Text style={styles.pkgCredit}>Credit ₹{credit.toLocaleString('en-IN')}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 16) + 18,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backTxt}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Wallet</Text>
          <TouchableOpacity onPress={() => navigation.navigate('WalletTransactions')}>
            <Text style={styles.txLink}>View Transactions</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLbl}>My Balance</Text>
          <Text style={styles.balanceAmt}>₹ {bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
        </View>

        <Text style={styles.section}>Add Balance to Wallet</Text>
        <View>
          {Array.from({ length: Math.ceil(WALLET_PACKAGES.length / 2) }, (_, row) => (
            <View key={row} style={styles.row}>
              {WALLET_PACKAGES.slice(row * 2, row * 2 + 2).map((p) => (
                <View key={`${p.pay}-${p.bonus}`} style={styles.pkgCell}>
                  {renderPkg({ item: p })}
                </View>
              ))}
              {WALLET_PACKAGES.slice(row * 2, row * 2 + 2).length === 1 ? <View style={styles.pkgCell} /> : null}
            </View>
          ))}
        </View>

        <View style={styles.secureRow}>
          <Text style={styles.lock}>🔒</Text>
          <Text style={styles.secureTxt}>100% Secure Payment</Text>
        </View>

        <TouchableOpacity style={styles.cta} onPress={onProceed} activeOpacity={0.9}>
          <Text style={styles.ctaTxt}>Proceed to Pay</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  content: { flexGrow: 1, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  back: { padding: 6 },
  backTxt: { fontSize: 22 },
  title: { fontSize: 18, fontWeight: '900', color: '#111' },
  txLink: { fontSize: 12, fontWeight: '800', color: PURPLE },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 20,
  },
  balanceLbl: { fontSize: 12, color: '#666', fontWeight: '700', marginBottom: 6 },
  balanceAmt: { fontSize: 28, fontWeight: '900', color: '#111' },
  section: { fontSize: 15, fontWeight: '900', color: '#111', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  pkgCell: { flex: 1, minWidth: 0 },
  pkg: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    minHeight: 100,
  },
  pkgActive: { borderColor: PURPLE, borderWidth: 2, backgroundColor: 'rgba(123,44,255,0.06)' },
  popular: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#dc2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popularTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
  pkgPay: { fontSize: 18, fontWeight: '900', color: '#111', marginTop: 8 },
  pkgBonus: { fontSize: 12, color: PURPLE, fontWeight: '800', marginTop: 4 },
  pkgCredit: { fontSize: 11, color: '#888', marginTop: 8, fontWeight: '600' },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  lock: { fontSize: 16 },
  secureTxt: { fontSize: 12, color: '#666', fontWeight: '700' },
  cta: {
    marginTop: 'auto',
    marginBottom: 0,
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
