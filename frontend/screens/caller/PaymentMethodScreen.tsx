import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { getErrorMessage, walletApi } from '../../services/api';
import { logMetaWalletPurchase } from '../../utils/metaAppEvents';
import { openRazorpayWalletCheckoutInApp } from '../../utils/openRazorpayWalletCheckout';
import { WALLET_RECHARGE_GST_PERCENT } from '../../utils/walletRechargeFees';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<CallerStackParamList, 'PaymentMethod'>;

export default function PaymentMethodScreen({ navigation, route }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const {
    payAmount,
    bonusPercent,
    creditAmount,
    gstAmount,
    platformFeeAmount,
    platformFeePercent,
    totalAmount,
    walletAmount,
  } = route.params;
  const { refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const onConfirm = async () => {
    setBusy(true);
    try {
      const paymentAmount = totalAmount || payAmount;
      const { data } = await walletApi.createRazorpayOrder({
        payAmount: paymentAmount,
        bonusPercent,
        walletAmount,
      });

      const checkout = await openRazorpayWalletCheckoutInApp(data);
      if (checkout.type === 'cancel') {
        return;
      }
      if (checkout.type === 'error') {
        Alert.alert('Checkout error', checkout.message);
        return;
      }

      const { data: verified } = await walletApi.verifyRazorpayPayment({
        razorpay_order_id: checkout.razorpay_order_id,
        razorpay_payment_id: checkout.razorpay_payment_id,
        razorpay_signature: checkout.razorpay_signature,
        payAmount: paymentAmount,
        bonusPercent,
        walletAmount,
      });
      void logMetaWalletPurchase({
        razorpayPaymentId: checkout.razorpay_payment_id,
        payAmountInr: paymentAmount,
        walletAmount,
      });
      await refreshUser();
      const nb =
        typeof verified.user.walletBalance === 'number' && Number.isFinite(verified.user.walletBalance)
          ? verified.user.walletBalance
          : 0;
      navigation.replace('WalletSuccess', { creditAdded: verified.creditAdded, newBalance: nb });
    } catch (e: unknown) {
      Alert.alert('Payment failed', getErrorMessage(e));
    } finally {
      setBusy(false);
    }
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backWrapper}>
            <Ionicons name="chevron-back" size={24} />
          </TouchableOpacity>
          <Text style={styles.title}>Select Payment Method</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Payment Breakdown</Text>

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Wallet Recharge:</Text>
            <Text style={styles.breakdownValue}>₹ {walletAmount.toLocaleString('en-IN')}</Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Platform fee ({platformFeePercent}%):</Text>
            <Text style={styles.breakdownValue}>₹ {platformFeeAmount.toLocaleString('en-IN')}</Text>
          </View>

          {gstAmount ? (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>GST ({WALLET_RECHARGE_GST_PERCENT}%):</Text>
              <Text style={styles.breakdownValue}>₹ {gstAmount.toLocaleString('en-IN')}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={[styles.breakdownRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total Payable</Text>
            <Text style={styles.totalValue}>₹ {(totalAmount || payAmount).toLocaleString('en-IN')}</Text>
          </View>
          <Text style={styles.gstLabel}>{WALLET_RECHARGE_GST_PERCENT}% GST on recharge + platform fee</Text>
        </View>

        <View style={styles.bonusCard}>
          <Text style={styles.bonusTitle}>🎉 You'll Receive</Text>
          <View style={styles.bonusRow}>
            <Text style={styles.bonusLabel}>Base Credit:</Text>
            <Text style={styles.bonusValue}>₹ {walletAmount.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.bonusRow}>
            <Text style={styles.bonusLabel}>Bonus ({bonusPercent}%):</Text>
            <Text style={styles.bonusValue}>
              +₹ {((walletAmount * bonusPercent) / 100).toLocaleString('en-IN')}
            </Text>
          </View>
          <View style={styles.dividerLight} />
          <View style={[styles.bonusRow, styles.totalCreditRow]}>
            <Text style={styles.totalCreditLabel}>Total Wallet Credit:</Text>
            <Text style={styles.totalCreditValue}>₹ {creditAmount.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        <View style={styles.opt}>
          <Text style={styles.optTitle}>Payment options</Text>
          <Text style={styles.optSub}>
            Opens Razorpay in-app: UPI apps / UPI ID, cards, netbanking and wallets. On phones Razorpay
            shows UPI apps instead of a QR code.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.cta, busy && styles.ctaDis]}
          onPress={() => void onConfirm()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaTxt}>
              Pay ₹{(totalAmount || payAmount).toLocaleString('en-IN')} with Razorpay
            </Text>
          )}
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
    marginBottom: 12,
  },
  backWrapper: { width: 32, alignItems: 'flex-start' },
  title: { fontSize: 16, fontWeight: '900', color: '#111', flex: 1, textAlign: 'center' },
  breakdownCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginBottom: 12,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  breakdownLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  breakdownValue: { fontSize: 13, color: '#111', fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  totalRow: { marginBottom: 4 },
  totalLabel: { fontSize: 15, fontWeight: '900', color: '#111' },
  totalValue: { fontSize: 16, fontWeight: '900', color: PURPLE },
  gstLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  bonusCard: {
    backgroundColor: '#faf5ff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eadfff',
    marginBottom: 12,
  },
  bonusTitle: { fontSize: 14, fontWeight: '900', color: '#111', marginBottom: 10 },
  bonusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  bonusLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  bonusValue: { fontSize: 13, color: '#111', fontWeight: '800' },
  dividerLight: { height: 1, backgroundColor: '#eadfff', marginVertical: 8 },
  totalCreditRow: { marginBottom: 0 },
  totalCreditLabel: { fontSize: 14, fontWeight: '900', color: '#111' },
  totalCreditValue: { fontSize: 15, fontWeight: '900', color: '#16a34a' },
  opt: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginBottom: 16,
  },
  optTitle: { fontSize: 14, fontWeight: '900', color: '#111', marginBottom: 6 },
  optSub: { fontSize: 12, color: '#666', lineHeight: 18, fontWeight: '600' },
  cta: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDis: { opacity: 0.6 },
  ctaTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
