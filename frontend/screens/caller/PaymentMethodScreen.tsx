import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { getErrorMessage, walletApi } from '../../services/api';
import type { RazorpayOrderResponse } from '../../types/api';
import { buildRazorpayWalletCheckoutHtml, parseRazorpayWebViewMessage } from '../../utils/razorpayWalletCheckoutHtml';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<CallerStackParamList, 'PaymentMethod'>;

export default function PaymentMethodScreen({ navigation, route }: Props): React.JSX.Element {
  const { payAmount, bonusPercent, creditAmount } = route.params;
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
          payAmount,
          bonusPercent,
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
    [bonusPercent, clearCheckoutUi, navigation, payAmount, refreshUser]
  );

  const onConfirm = async () => {
    checkoutHandledRef.current = false;
    setBusy(true);
    try {
      const { data } = await walletApi.createRazorpayOrder({ payAmount, bonusPercent });
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Select Payment Method</Text>
        <View style={{ width: 32 }} />
      </View>

      <Text style={styles.summary}>
        Pay ₹{payAmount.toLocaleString('en-IN')} · Credit ₹{creditAmount.toLocaleString('en-IN')}
      </Text>

      <View style={styles.opt}>
        <Text style={styles.optTitle}>Payment options</Text>
        <Text style={styles.optSub}>
          The secure Razorpay window supports UPI, cards, and net banking. In test mode, use Razorpay test
          cards from the dashboard; UPI apps may not complete inside the in-app browser.
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
          <Text style={styles.ctaTxt}>Pay with Razorpay</Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={checkoutOpen && Boolean(checkoutHtml)}
        animationType="slide"
        onRequestClose={() => {
          if (!checkoutHandledRef.current) closeCheckout();
        }}
      >
        <View style={styles.modalRoot}>
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
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7', paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  back: { padding: 6 },
  backTxt: { fontSize: 22 },
  title: { fontSize: 16, fontWeight: '900', color: '#111', flex: 1, textAlign: 'center' },
  summary: { fontSize: 13, color: '#555', marginBottom: 18, textAlign: 'center', fontWeight: '600' },
  opt: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginBottom: 10,
  },
  optActive: { borderColor: PURPLE, borderWidth: 2, backgroundColor: 'rgba(123,44,255,0.06)' },
  optTitle: { fontSize: 16, fontWeight: '900', color: '#111' },
  optSub: { fontSize: 12, color: '#666', marginTop: 4, fontWeight: '600' },
  cta: {
    marginTop: 'auto',
    marginBottom: 28,
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
