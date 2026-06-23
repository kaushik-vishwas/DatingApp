import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { getErrorMessage, walletApi } from '../../services/api';
import type { RazorpayOrderResponse, WalletOfferRow } from '../../types/api';
import { buildRazorpayWalletCheckoutHtml, parseRazorpayWebViewMessage } from '../../utils/razorpayWalletCheckoutHtml';
import {
  computeWalletRechargeBreakdown,
  walletCreditForRecharge,
} from '../../utils/walletRechargeFees';

const PURPLE = '#7b2cff';

type Props = {
  visible: boolean;
  onClose: () => void;
  onRechargeSuccess: (newWalletBalanceInr: number, creditAdded: number) => void;
};

function creditForOffer(amount: number, bonusPercent: number): number {
  return walletCreditForRecharge(amount, bonusPercent);
}

export default function InCallTalktimeRechargeModal({
  visible,
  onClose,
  onRechargeSuccess,
}: Props): React.JSX.Element {
  const [offers, setOffers] = useState<WalletOfferRow[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [selected, setSelected] = useState<WalletOfferRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<RazorpayOrderResponse | null>(null);
  const checkoutHandledRef = useRef(false);

  const resetCheckout = useCallback(() => {
    setCheckoutOpen(false);
    setCheckoutHtml(null);
    setActiveOrder(null);
    checkoutHandledRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    resetCheckout();
    onClose();
  }, [busy, onClose, resetCheckout]);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      resetCheckout();
      return;
    }
    let mounted = true;
    void (async () => {
      try {
        setLoadingOffers(true);
        const { data } = await walletApi.offers();
        if (!mounted) return;
        setOffers(data.offers ?? []);
      } catch {
        if (!mounted) return;
        setOffers([]);
      } finally {
        if (mounted) setLoadingOffers(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [visible, resetCheckout]);

  const onProceedToPay = async () => {
    if (!selected) {
      Alert.alert('Select a plan', 'Choose a recharge pack to continue.');
      return;
    }
    checkoutHandledRef.current = false;
    setBusy(true);
    try {
      const breakdown = computeWalletRechargeBreakdown(selected.amount);
      const { data } = await walletApi.createRazorpayOrder({
        payAmount: breakdown.totalPayable,
        bonusPercent: selected.bonusPercent,
        walletAmount: breakdown.walletAmount,
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

  const onWebMessage = useCallback(
    async (raw: string) => {
      const msg = parseRazorpayWebViewMessage(raw);
      if (!msg) return;

      if (msg.type === 'dismiss') {
        if (checkoutHandledRef.current) return;
        resetCheckout();
        return;
      }

      if (msg.type === 'error') {
        checkoutHandledRef.current = true;
        resetCheckout();
        Alert.alert('Checkout error', msg.message);
        return;
      }

      if (!selected) {
        resetCheckout();
        return;
      }

      checkoutHandledRef.current = true;
      setBusy(true);
      resetCheckout();
      try {
        const breakdown = computeWalletRechargeBreakdown(selected.amount);
        const { data } = await walletApi.verifyRazorpayPayment({
          razorpay_order_id: msg.razorpay_order_id,
          razorpay_payment_id: msg.razorpay_payment_id,
          razorpay_signature: msg.razorpay_signature,
          payAmount: breakdown.totalPayable,
          bonusPercent: selected.bonusPercent,
          walletAmount: breakdown.walletAmount,
        });
        const newBalance =
          typeof data.user.walletBalance === 'number' && Number.isFinite(data.user.walletBalance)
            ? data.user.walletBalance
            : 0;
        onRechargeSuccess(newBalance, data.creditAdded);
        Alert.alert(
          'Talktime added',
          `₹${data.creditAdded.toLocaleString('en-IN')} added to your wallet. Your call continues.`
        );
        onClose();
      } catch (e: unknown) {
        checkoutHandledRef.current = false;
        Alert.alert('Verification failed', getErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [onClose, onRechargeSuccess, resetCheckout, selected]
  );

  return (
    <>
      <Modal visible={visible && !checkoutOpen} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Add talktime</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>Recharge without ending your call. Choose a plan:</Text>

            {loadingOffers ? (
              <ActivityIndicator color={PURPLE} style={{ marginVertical: 24 }} />
            ) : offers.length === 0 ? (
              <Text style={styles.empty}>No recharge plans available right now.</Text>
            ) : (
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {Array.from({ length: Math.ceil(offers.length / 2) }, (_, row) => (
                  <View key={row} style={styles.row}>
                    {offers.slice(row * 2, row * 2 + 2).map((item) => {
                      const active = selected?.id === item.id;
                      const credit = creditForOffer(item.amount, item.bonusPercent);
                      return (
                        <TouchableOpacity
                          key={item.id ?? `${item.amount}-${item.bonusPercent}`}
                          style={[styles.pkg, active && styles.pkgActive]}
                          onPress={() => setSelected(item)}
                          activeOpacity={0.9}
                        >
                          {item.popular ? (
                            <View style={styles.popular}>
                              <Text style={styles.popularTxt}>Popular</Text>
                            </View>
                          ) : null}
                          <Text style={styles.pkgPay}>₹ {item.amount}</Text>
                          <Text style={styles.pkgBonus}>+{item.bonusPercent}% Extra</Text>
                          <Text style={styles.pkgCredit}>Credit ₹{credit.toLocaleString('en-IN')}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {offers.slice(row * 2, row * 2 + 2).length === 1 ? <View style={styles.pkgSpacer} /> : null}
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.cta, (busy || !selected || offers.length === 0) && styles.ctaDisabled]}
              onPress={() => void onProceedToPay()}
              disabled={busy || !selected || offers.length === 0}
              activeOpacity={0.9}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaTxt}>Proceed to Pay</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={visible && checkoutOpen && Boolean(checkoutHtml)}
        animationType="slide"
        onRequestClose={() => {
          if (!checkoutHandledRef.current && !busy) resetCheckout();
        }}
      >
        <SafeAreaView style={styles.checkoutRoot} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.checkoutBar}>
            <Text style={styles.checkoutTitle}>Secure payment</Text>
            <TouchableOpacity
              onPress={() => {
                if (!checkoutHandledRef.current && !busy) resetCheckout();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.checkoutClose}>Close</Text>
            </TouchableOpacity>
          </View>
          {checkoutHtml ? (
            <WebView
              key={activeOrder?.orderId ?? 'rzp-incall'}
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
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    maxHeight: '82%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: { fontSize: 18, fontWeight: '900', color: '#111' },
  close: { fontSize: 20, color: '#666', fontWeight: '700' },
  subtitle: { fontSize: 13, color: '#666', fontWeight: '600', marginBottom: 12 },
  scroll: { maxHeight: 340 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  pkg: {
    flex: 1,
    backgroundColor: '#f8f8f9',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    minHeight: 96,
  },
  pkgSpacer: { flex: 1 },
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
  pkgPay: { fontSize: 17, fontWeight: '900', color: '#111', marginTop: 8 },
  pkgBonus: { fontSize: 12, color: PURPLE, fontWeight: '800', marginTop: 4 },
  pkgCredit: { fontSize: 11, color: '#888', marginTop: 8, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginVertical: 20, fontWeight: '600' },
  cta: {
    marginTop: 12,
    backgroundColor: PURPLE,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.55 },
  ctaTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  checkoutRoot: { flex: 1, backgroundColor: '#fff' },
  checkoutBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
  },
  checkoutTitle: { fontSize: 16, fontWeight: '800', color: '#111' },
  checkoutClose: { fontSize: 15, fontWeight: '700', color: PURPLE },
  webLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  webLoadingTxt: { marginTop: 10, fontWeight: '600', color: '#555' },
});
