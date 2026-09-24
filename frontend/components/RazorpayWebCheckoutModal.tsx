import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import type { RazorpayOrderResponse } from '../types/api';
import {
  buildRazorpayCheckoutHtml,
  isExternalPaymentUrl,
  openPaymentAppUrl,
  type RazorpayCheckoutPrefill,
  type RazorpayNativeCheckoutResult,
} from '../utils/openRazorpayWalletCheckout';

type Order = Pick<RazorpayOrderResponse, 'orderId' | 'amount' | 'currency' | 'keyId' | 'businessName'>;

type Props = {
  visible: boolean;
  order: Order | null;
  prefill?: RazorpayCheckoutPrefill;
  /** Fired when user returns from UPI / payment app while checkout is open. */
  onAppForeground?: () => void;
  onResult: (result: RazorpayNativeCheckoutResult) => void;
};

const PURPLE = '#7b2cff';

function friendlyPaymentFailure(raw: unknown): string {
  const detail = String(raw ?? '').trim();
  const base =
    'Your payment did not go through and no money was added or deducted. Please try again — if UPI keeps failing, pay with Enter UPI ID, card or netbanking.';
  return detail ? `${base}\n\nReason: ${detail}` : base;
}

/**
 * Standard Checkout via Checkout.js inside a WebView (not react-native-razorpay SDK).
 * UPI Intent deep links are handed to the OS so GPay/PhonePe/etc. can open.
 */
export default function RazorpayWebCheckoutModal({
  visible,
  order,
  prefill,
  onAppForeground,
  onResult,
}: Props): React.JSX.Element | null {
  const html = useMemo(() => {
    if (!order) return '';
    return buildRazorpayCheckoutHtml(order, prefill);
  }, [order, prefill]);

  useEffect(() => {
    if (!visible || !onAppForeground) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onAppForeground();
    });
    return () => sub.remove();
  }, [visible, onAppForeground]);

  if (!visible || !order) return null;

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const raw = JSON.parse(String(event.nativeEvent.data ?? '')) as Record<string, unknown>;
      const type = String(raw.type ?? '');
      if (type === 'success') {
        const paymentId = String(raw.razorpay_payment_id ?? '').trim();
        const orderId = String(raw.razorpay_order_id ?? '').trim();
        const signature = String(raw.razorpay_signature ?? '').trim();
        if (!paymentId || !orderId || !signature) {
          onResult({ type: 'error', message: 'Incomplete payment response from Razorpay' });
          return;
        }
        onResult({
          type: 'success',
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          razorpay_signature: signature,
        });
        return;
      }
      if (type === 'cancel') {
        onResult({ type: 'cancel' });
        return;
      }
      if (type === 'attempt_failed') {
        // Checkout stays open showing Razorpay's retry / other-methods screen — don't close it.
        if (__DEV__) {
          console.warn('[Razorpay] payment attempt failed:', raw.reason, raw.message);
        }
        return;
      }
      if (type === 'error') {
        onResult({ type: 'error', message: friendlyPaymentFailure(raw.message) });
      }
    } catch {
      onResult({ type: 'error', message: 'Invalid checkout response' });
    }
  };

  const openExternal = (url: string) => {
    // Do not abort checkout if the app fails to open — user can pick another method.
    void openPaymentAppUrl(url);
  };

  const onShouldStartLoadWithRequest = (request: ShouldStartLoadRequest): boolean => {
    const url = String(request.url ?? '');
    if (isExternalPaymentUrl(url)) {
      openExternal(url);
      return false;
    }
    return true;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onResult({ type: 'cancel' })}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Payment</Text>
          <TouchableOpacity onPress={() => onResult({ type: 'cancel' })} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>
        <WebView
          source={{ html, baseUrl: 'https://api.razorpay.com' }}
          originWhitelist={['*', 'upi://*', 'phonepe://*', 'tez://*', 'gpay://*', 'paytmmp://*', 'intent://*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          setSupportMultipleWindows
          onOpenWindow={(e) => {
            const target = String(e.nativeEvent.targetUrl ?? '');
            if (target) openExternal(target);
          }}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          thirdPartyCookiesEnabled
          setBuiltInZoomControls={false}
          scalesPageToFit
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={PURPLE} size="large" />
            </View>
          )}
          style={styles.webview}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e4f2',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  close: { fontSize: 15, fontWeight: '600', color: PURPLE },
  webview: { flex: 1 },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
