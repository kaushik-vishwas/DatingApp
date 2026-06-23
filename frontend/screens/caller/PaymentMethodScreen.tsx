import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { getErrorMessage, walletApi } from '../../services/api';
import type { RazorpayOrderResponse } from '../../types/api';
import { buildRazorpayWalletCheckoutHtml, parseRazorpayWebViewMessage } from '../../utils/razorpayWalletCheckoutHtml';
import { WALLET_RECHARGE_GST_PERCENT } from '../../utils/walletRechargeFees';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<CallerStackParamList, 'PaymentMethod'>;

export default function PaymentMethodScreen({ navigation, route }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { payAmount, bonusPercent, creditAmount, gstAmount, platformFeeAmount, platformFeePercent, totalAmount, walletAmount } = route.params;
  const { refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<RazorpayOrderResponse | null>(null);
  const checkoutHandledRef = useRef(false);

  const clearCheckoutUi = useCallback(() => {
    setCheckoutOpen(false);
    setCheckoutHtml(null);
    setActiveOrder(null);
  }, []);

  const closeCheckout = useCallback(() => {
    clearCheckoutUi();
    checkoutHandledRef.current = false;
  }, [clearCheckoutUi]);

  const onWebMessage = useCallback(
    async (raw: string) => {
      const msg = parseRazorpayWebViewMessage(raw);
      if (!msg) return;

      if (msg.type === 'dismiss') {
        if (checkoutHandledRef.current) return;
        closeCheckout();
        return;
      }

      if (msg.type === 'error') {
        checkoutHandledRef.current = true;
        closeCheckout();
        Alert.alert('Checkout error', msg.message);
        return;
      }

      checkoutHandledRef.current = true;
      setBusy(true);
      clearCheckoutUi();
      try {
        const { data } = await walletApi.verifyRazorpayPayment({
          razorpay_order_id: msg.razorpay_order_id,
          razorpay_payment_id: msg.razorpay_payment_id,
          razorpay_signature: msg.razorpay_signature,
          payAmount: totalAmount || payAmount,
          bonusPercent,
          walletAmount,
        });
        await refreshUser();
        const nb =
          typeof data.user.walletBalance === 'number' && Number.isFinite(data.user.walletBalance)
            ? data.user.walletBalance
            : 0;
        navigation.replace('WalletSuccess', { creditAdded: data.creditAdded, newBalance: nb });
      } catch (e: unknown) {
        checkoutHandledRef.current = false;
        Alert.alert('Verification failed', getErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [bonusPercent, clearCheckoutUi, navigation, payAmount, totalAmount, walletAmount, refreshUser]
  );

  const onConfirm = async () => {
    checkoutHandledRef.current = false;
    setBusy(true);
    try {
      // Use totalAmount with GST for payment
      const paymentAmount = totalAmount || payAmount;
      const { data } = await walletApi.createRazorpayOrder({
        payAmount: paymentAmount,
        bonusPercent,
        walletAmount,
      });
      setActiveOrder(data);
      setCheckoutHtml(buildRazorpayWalletCheckoutHtml(data));
      setCheckoutOpen(true);
    } catch (e: unknown) {
      Alert.alert('Could not start payment', getErrorMessage(e));
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

        {/* GST Breakdown Section */}
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

        {/* Bonus & Credit Info */}
        <View style={styles.bonusCard}>
          <Text style={styles.bonusTitle}>🎉 You'll Receive</Text>
          <View style={styles.bonusRow}>
            <Text style={styles.bonusLabel}>Base Credit:</Text>
            <Text style={styles.bonusValue}>₹ {walletAmount.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.bonusRow}>
            <Text style={styles.bonusLabel}>Bonus ({bonusPercent}%):</Text>
            <Text style={styles.bonusValue}>+₹ {(walletAmount * bonusPercent / 100).toLocaleString('en-IN')}</Text>
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
            The secure Razorpay window supports UPI, cards, and net banking. In test mode, use Razorpay
            test cards from the dashboard; UPI apps may not complete inside the in-app browser.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.cta, (busy || checkoutOpen) && styles.ctaDis]}
          onPress={() => void onConfirm()}
          disabled={busy || checkoutOpen}
        >
          {busy && !checkoutOpen ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaTxt}>
              Pay ₹{(totalAmount || payAmount).toLocaleString('en-IN')} with Razorpay
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={checkoutOpen && Boolean(checkoutHtml)}
        animationType="slide"
        onRequestClose={() => {
          if (!checkoutHandledRef.current) closeCheckout();
        }}
      >
        <SafeAreaView style={styles.modalRoot} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.modalBar}>
            <Text style={styles.modalTitle}>Secure payment</Text>
            <TouchableOpacity
              onPress={() => {
                if (!checkoutHandledRef.current) closeCheckout();
              }}
              style={styles.modalClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.modalCloseTxt}>Close</Text>
            </TouchableOpacity>
          </View>
          {checkoutHtml ? (
            <WebView
              key={activeOrder?.orderId ?? 'rzp'}
              originWhitelist={['*']}
              source={{ html: checkoutHtml, baseUrl: 'https://razorpay.com' }}
              onMessage={(ev) => void onWebMessage(ev.nativeEvent.data)}
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              javaScriptCanOpenWindowsAutomatically
              startInLoadingState
              renderLoading={() => (
                <View style={styles.webLoading}>
                  <ActivityIndicator size="large" color={PURPLE} />
                  <Text style={styles.webLoadingTxt}>Opening Razorpay…</Text>
                </View>
              )}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
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
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },

  backWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF0FA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  breakdownValue: {
    fontSize: 13,
    color: '#111',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e8e8e8',
    marginVertical: 8,
  },
  totalRow: {
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    color: '#111',
    fontWeight: '900',
  },

  gstLabel: {
    fontSize: 12,
    color: '#111',
    fontWeight: '400',
  },
  totalValue: {
    fontSize: 16,
    color: PURPLE,
    fontWeight: '900',
  },

  bonusCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginBottom: 12,
  },
  bonusTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111',
    marginBottom: 12,
  },
  bonusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bonusLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  bonusValue: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '700',
  },
  dividerLight: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 8,
  },
  totalCreditRow: {
    marginTop: 4,
  },
  totalCreditLabel: {
    fontSize: 14,
    color: '#111',
    fontWeight: '900',
  },
  totalCreditValue: {
    fontSize: 15,
    color: PURPLE,
    fontWeight: '900',
  },

  opt: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginBottom: 10,
  },
  optTitle: { fontSize: 16, fontWeight: '900', color: '#111' },
  optSub: { fontSize: 12, color: '#666', marginTop: 4, fontWeight: '600' },

  cta: {
    marginTop: 'auto',
    marginBottom: 0,
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaDis: { opacity: 0.7 },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },

  modalRoot: { flex: 1, backgroundColor: '#fff' },
  modalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111' },
  modalClose: { paddingVertical: 4, paddingHorizontal: 8 },
  modalCloseTxt: { fontSize: 15, fontWeight: '700', color: PURPLE },
  webLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  webLoadingTxt: { marginTop: 10, fontWeight: '600', color: '#555' },
});