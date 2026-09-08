import { Alert, Linking, Platform } from 'react-native';

import type { RazorpayOrderResponse } from '../types/api';

export type RazorpayNativeCheckoutResult =
  | {
      type: 'success';
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }
  | { type: 'cancel' }
  | { type: 'error'; message: string };

export type RazorpayCheckoutPrefill = {
  name?: string | null;
  contact?: string | null;
  email?: string | null;
};

/** Razorpay Checkout expects a 10-digit Indian mobile (no +91). */
export function normalizeRazorpayContact(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

/**
 * Build Standard Checkout options for Checkout.js (web).
 * Single flat block. Do NOT set UPI `flows` — forcing `qr` on mobile hides
 * Enter UPI ID (collect) and can leave no usable UPI instruments.
 */
export function buildWebCheckoutOptions(
  order: Pick<RazorpayOrderResponse, 'orderId' | 'amount' | 'currency' | 'keyId' | 'businessName'>,
  prefill?: RazorpayCheckoutPrefill,
): Record<string, unknown> {
  const contact = normalizeRazorpayContact(prefill?.contact);
  const name = String(prefill?.name ?? '').trim();
  const email = String(prefill?.email ?? '').trim();

  const prefillPayload: Record<string, string> = {};
  if (contact) prefillPayload.contact = contact;
  if (name) prefillPayload.name = name;
  if (email && email.includes('@')) prefillPayload.email = email;

  const readonly: Record<string, boolean> = {};
  if (contact) readonly.contact = true;
  if (name) readonly.name = true;

  return {
    key: order.keyId,
    amount: order.amount,
    currency: order.currency || 'INR',
    order_id: order.orderId,
    name: order.businessName || 'Selecto',
    description: 'Wallet recharge',
    theme: { color: '#7b2cff' },
    retry: { enabled: true, max_count: 4 },
    send_sms_hash: true,
    remember_customer: true,
    ...(Object.keys(prefillPayload).length > 0 ? { prefill: prefillPayload } : {}),
    ...(Object.keys(readonly).length > 0 ? { readonly } : {}),
    config: {
      display: {
        blocks: {
          all: {
            name: 'Payment options',
            instruments: [
              { method: 'upi' },
              { method: 'card' },
              { method: 'netbanking' },
              { method: 'wallet' },
            ],
          },
        },
        sequence: ['block.all'],
        preferences: {
          show_default_blocks: false,
        },
      },
    },
  };
}

/**
 * Minimal HTML that immediately opens Razorpay Checkout (no extra "Complete payment" screen).
 */
export function buildRazorpayCheckoutHtml(
  order: Pick<RazorpayOrderResponse, 'orderId' | 'amount' | 'currency' | 'keyId' | 'businessName'>,
  prefill?: RazorpayCheckoutPrefill,
): string {
  const options = buildWebCheckoutOptions(order, prefill);
  const optionsJson = JSON.stringify(options);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Selecto Pay</title>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; height: 100%; }
  </style>
</head>
<body>
  <script>
    (function () {
      var options = ${optionsJson};
      var closed = false;

      function post(payload) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        } catch (e) {}
      }

      function openCheckout() {
        if (typeof Razorpay === 'undefined') {
          post({ type: 'error', message: 'Razorpay Checkout.js failed to load' });
          return;
        }

        options.handler = function (response) {
          closed = true;
          post({
            type: 'success',
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature
          });
        };

        options.modal = {
          ondismiss: function () {
            if (closed) return;
            closed = true;
            post({ type: 'cancel' });
          }
        };

        try {
          var rzp = new Razorpay(options);
          rzp.on('payment.failed', function (response) {
            var desc =
              (response && response.error && (response.error.description || response.error.reason)) ||
              'Payment failed';
            post({ type: 'error', message: String(desc) });
          });
          rzp.open();
        } catch (err) {
          post({ type: 'error', message: String((err && err.message) || err || 'Could not open checkout') });
        }
      }

      if (document.readyState === 'complete') openCheckout();
      else window.addEventListener('load', openCheckout);
    })();
  </script>
</body>
</html>`;
}

/** True for UPI / wallet app deep links that must leave the WebView. */
export function isExternalPaymentUrl(url: string): boolean {
  const u = String(url || '').trim().toLowerCase();
  if (!u) return false;
  if (
    u.startsWith('http://') ||
    u.startsWith('https://') ||
    u.startsWith('about:') ||
    u.startsWith('data:') ||
    u.startsWith('blob:')
  ) {
    return false;
  }
  return true;
}

/**
 * Convert Android `intent://...#Intent;scheme=upi;package=...;end` into an openable URL.
 */
export function resolvePaymentDeepLink(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (!/^intent:/i.test(raw)) return raw;

  const fallback = /S\.browser_fallback_url=([^;]+)/i.exec(raw)?.[1];
  if (fallback) {
    try {
      return decodeURIComponent(fallback);
    } catch {
      return fallback;
    }
  }

  const scheme = /;scheme=([^;]+)/i.exec(raw)?.[1]?.trim();
  if (scheme) {
    // intent://host/path?query#Intent;scheme=upi;... → upi://host/path?query
    return raw.replace(/^intent:/i, `${scheme}:`).replace(/#Intent;.*$/i, '');
  }

  return raw;
}

/**
 * Open GPay / PhonePe / UPI intent. Does not fail the checkout on error.
 * Note: Expo Go often cannot open UPI apps (missing Android package queries).
 * A Selecto native build with the UPI queries plugin is required for reliable intent.
 */
export async function openPaymentAppUrl(url: string): Promise<boolean> {
  const target = resolvePaymentDeepLink(url);
  if (!target) return false;

  try {
    if (Platform.OS === 'android' && /^intent:/i.test(url) && target === url) {
      // Unresolved intent:// — try opening as-is anyway
    }
    const can = await Linking.canOpenURL(target).catch(() => true);
    if (!can) {
      Alert.alert(
        'Payment app',
        'Could not open that UPI app. Install Google Pay / PhonePe / Paytm, or use Enter UPI ID. If you are on Expo Go, install the Selecto app build for UPI apps to open.',
      );
      return false;
    }
    await Linking.openURL(target);
    return true;
  } catch {
    try {
      await Linking.openURL(target);
      return true;
    } catch {
      Alert.alert(
        'Payment app',
        'Could not open that UPI app. Try another app, Enter UPI ID, or card. Expo Go often blocks UPI app links — use a Selecto APK for full UPI Intent.',
      );
      return false;
    }
  }
}
