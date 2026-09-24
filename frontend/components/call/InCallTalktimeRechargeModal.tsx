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

import RazorpayWebCheckoutModal from '../RazorpayWebCheckoutModal';
import { useWalletPaymentRecovery } from '../../hooks/useWalletPaymentRecovery';
import { getErrorMessage, walletApi } from '../../services/api';
import type { RazorpayOrderResponse, WalletOfferRow } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { logMetaWalletPurchase } from '../../utils/metaAppEvents';
import type { RazorpayNativeCheckoutResult } from '../../utils/openRazorpayWalletCheckout';
import {
  clearPendingWalletCheckout,
  confirmWalletPaymentWithRetry,
  PAYMENT_CONFIRMING_MESSAGE,
  PAYMENT_CONFIRMING_TITLE,
  reconcilePendingWalletCheckout,
  savePendingWalletCheckout,
  type PendingWalletCheckout,
} from '../../utils/pendingWalletCheckout';
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
  const { user } = useAuth();
  const [offers, setOffers] = useState<WalletOfferRow[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [selected, setSelected] = useState<WalletOfferRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<RazorpayOrderResponse | null>(null);
  const [pendingBreakdown, setPendingBreakdown] = useState<{
    totalPayable: number;
    walletAmount: number;
    bonusPercent: number;
  } | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<PendingWalletCheckout | null>(null);

  /** Checkout success + foreground reconcile can both credit — apply once per order. */
  const creditAppliedRef = useRef(false);
  const startingOrderRef = useRef(false);

  const applyCreditedWallet = useCallback(
    (creditAdded: number, newBalance: number) => {
      if (creditAppliedRef.current) return;
      creditAppliedRef.current = true;
      void clearPendingWalletCheckout();
      setPendingCheckout(null);
      setCheckoutOrder(null);
      setPendingBreakdown(null);
      onRechargeSuccess(newBalance, creditAdded);
      Alert.alert(
        'Talktime added',
        `₹${creditAdded.toLocaleString('en-IN')} added to your wallet. Your call continues.`,
      );
      onClose();
    },
    [onClose, onRechargeSuccess]
  );

  const { reconcileNow } = useWalletPaymentRecovery({
    enabled: Boolean(checkoutOrder && pendingCheckout),
    pending: pendingCheckout,
    onCredited: (result) => {
      const newBalance =
        typeof result.data.user.walletBalance === 'number' && Number.isFinite(result.data.user.walletBalance)
          ? result.data.user.walletBalance
          : 0;
      applyCreditedWallet(result.data.creditAdded, newBalance);
    },
  });

  const handleClose = useCallback(() => {
    if (busy || checkoutOrder) return;
    onClose();
  }, [busy, checkoutOrder, onClose]);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setCheckoutOrder(null);
      setPendingBreakdown(null);
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
  }, [visible]);

  const finishCheckout = async (checkout: RazorpayNativeCheckoutResult) => {
    const breakdown = pendingBreakdown;
    setCheckoutOrder(null);
    setPendingBreakdown(null);
    if (checkout.type === 'cancel') {
      // User may close checkout after paying in the UPI app, before Checkout.js saw the success.
      setBusy(true);
      try {
        const recovered = await reconcilePendingWalletCheckout(pendingCheckout);
        if (recovered.status === 'credited') {
          const newBalance =
            typeof recovered.data.user.walletBalance === 'number' &&
            Number.isFinite(recovered.data.user.walletBalance)
              ? recovered.data.user.walletBalance
              : 0;
          applyCreditedWallet(recovered.data.creditAdded, newBalance);
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    if (checkout.type === 'error') {
      setBusy(false);
      Alert.alert('Checkout error', checkout.message);
      return;
    }
    if (!breakdown) {
      setBusy(false);
      Alert.alert('Payment failed', 'Missing recharge details. Try again.');
      return;
    }

    setBusy(true);
    try {
      const { data: verified } = await walletApi.verifyRazorpayPayment({
        razorpay_order_id: checkout.razorpay_order_id,
        razorpay_payment_id: checkout.razorpay_payment_id,
        razorpay_signature: checkout.razorpay_signature,
        payAmount: breakdown.totalPayable,
        bonusPercent: breakdown.bonusPercent,
        walletAmount: breakdown.walletAmount,
      });
      void logMetaWalletPurchase({
        razorpayPaymentId: checkout.razorpay_payment_id,
        payAmountInr: breakdown.totalPayable,
        walletAmount: breakdown.walletAmount,
      });
      const newBalance =
        typeof verified.user.walletBalance === 'number' && Number.isFinite(verified.user.walletBalance)
          ? verified.user.walletBalance
          : 0;
      await clearPendingWalletCheckout();
      setPendingCheckout(null);
      applyCreditedWallet(verified.creditAdded, newBalance);
    } catch (e: unknown) {
      if (__DEV__) console.warn('[wallet] verify failed, reconciling:', getErrorMessage(e));
      // Razorpay already reported success — money is likely taken, so never say "failed" here.
      const recovered = await confirmWalletPaymentWithRetry(
        pendingCheckout,
        checkout.razorpay_payment_id
      );
      if (recovered.status === 'credited') {
        const newBalance =
          typeof recovered.data.user.walletBalance === 'number' &&
          Number.isFinite(recovered.data.user.walletBalance)
            ? recovered.data.user.walletBalance
            : 0;
        applyCreditedWallet(recovered.data.creditAdded, newBalance);
        return;
      }
      Alert.alert(PAYMENT_CONFIRMING_TITLE, PAYMENT_CONFIRMING_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const onProceedToPay = async () => {
    if (!selected) {
      Alert.alert('Select a plan', 'Choose a recharge pack to continue.');
      return;
    }
    // `busy` only disables the button after re-render — a fast double tap would create two orders.
    if (startingOrderRef.current) return;
    startingOrderRef.current = true;
    creditAppliedRef.current = false;
    setBusy(true);
    try {
      const breakdown = computeWalletRechargeBreakdown(selected.amount);
      const { data } = await walletApi.createRazorpayOrder({
        payAmount: breakdown.totalPayable,
        bonusPercent: selected.bonusPercent,
        walletAmount: breakdown.walletAmount,
      });
      setPendingBreakdown({
        totalPayable: breakdown.totalPayable,
        walletAmount: breakdown.walletAmount,
        bonusPercent: selected.bonusPercent,
      });
      const pending: PendingWalletCheckout = {
        orderId: data.orderId,
        payAmount: breakdown.totalPayable,
        bonusPercent: selected.bonusPercent,
        walletAmount: breakdown.walletAmount,
        startedAt: Date.now(),
      };
      await savePendingWalletCheckout(pending);
      setPendingCheckout(pending);
      setCheckoutOrder(data);
    } catch (e: unknown) {
      setBusy(false);
      Alert.alert('Could not start payment', getErrorMessage(e));
    } finally {
      startingOrderRef.current = false;
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
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
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Proceed to Pay</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <RazorpayWebCheckoutModal
        visible={Boolean(checkoutOrder)}
        order={checkoutOrder}
        prefill={{ name: user?.name, contact: user?.phone }}
        onAppForeground={() => {
          void reconcileNow();
        }}
        onResult={(result) => {
          void finishCheckout(result);
        }}
      />
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
  empty: { fontSize: 13, color: '#888', textAlign: 'center', marginVertical: 20 },
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
  popularTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  pkgPay: { fontSize: 18, fontWeight: '900', color: '#111', marginTop: 8 },
  pkgBonus: { fontSize: 12, fontWeight: '700', color: '#16a34a', marginTop: 4 },
  pkgCredit: { fontSize: 11, color: '#666', marginTop: 4, fontWeight: '600' },
  cta: {
    marginTop: 12,
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.55 },
  ctaTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
