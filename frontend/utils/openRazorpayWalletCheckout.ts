import { NativeModules } from 'react-native';

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

type RazorpaySuccess = {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};

type RazorpayFailure = {
  code?: number | string;
  description?: string;
  message?: string;
  error?: { code?: number | string; description?: string; reason?: string };
};

type RazorpayCheckoutModule = {
  open: (options: Record<string, unknown>) => Promise<RazorpaySuccess>;
};

function isUserCancel(err: RazorpayFailure): boolean {
  const code = String(err.code ?? err.error?.code ?? '');
  const desc = String(err.description ?? err.error?.description ?? err.message ?? err.error?.reason ?? '');
  // Razorpay RN: 0 / 2 often mean dismissed / cancelled
  if (code === '0' || code === '2') return true;
  return /cancel|dismiss|back.?press/i.test(desc);
}

function isRazorpayNativeAvailable(): boolean {
  return Boolean(NativeModules.RNRazorpayCheckout || NativeModules.RazorpayEventEmitter);
}

/**
 * Lazily load react-native-razorpay only when the native module is linked.
 * A static import crashes Expo Go (NativeEventEmitter with a missing module).
 */
function loadRazorpayCheckout(): RazorpayCheckoutModule | null {
  if (!isRazorpayNativeAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-razorpay') as { default?: RazorpayCheckoutModule } & RazorpayCheckoutModule;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

/**
 * Build Standard Checkout options for maximum instrument coverage.
 *
 * Notes:
 * - Do not pass a restrictive `method` filter — let Razorpay show everything enabled on the account.
 * - UPI QR is requested via config; Razorpay still hides QR on phone screens under ~485px
 *   (official limitation) and shows UPI apps / UPI ID instead — that is the correct mobile path.
 * - Never prefill phone/email; bad values can block instruments.
 */
function buildCheckoutOptions(
  order: Pick<RazorpayOrderResponse, 'orderId' | 'amount' | 'currency' | 'keyId' | 'businessName'>,
): Record<string, unknown> {
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
    remember_customer: false,
    config: {
      display: {
        // Highlight common methods first; keep Razorpay defaults for the rest.
        blocks: {
          popular: {
            name: 'Pay using',
            instruments: [
              {
                method: 'upi',
                // intent = UPI apps (phones); collect = UPI ID; qr = shown only on wide screens
                flows: ['intent', 'collect', 'qr'],
              },
              { method: 'card' },
              { method: 'netbanking' },
              { method: 'wallet' },
            ],
          },
        },
        sequence: ['block.popular', 'upi', 'card', 'netbanking', 'wallet'],
        preferences: {
          show_default_blocks: true,
        },
        hide: [],
      },
    },
  };
}

/**
 * In-app Razorpay Checkout via native SDK (not WebView / not external browser).
 */
export async function openRazorpayWalletCheckoutInApp(
  order: Pick<RazorpayOrderResponse, 'orderId' | 'amount' | 'currency' | 'keyId' | 'businessName'>,
): Promise<RazorpayNativeCheckoutResult> {
  const RazorpayCheckout = loadRazorpayCheckout();
  if (!RazorpayCheckout?.open) {
    return {
      type: 'error',
      message:
        'Razorpay needs a native app build (Expo Go is not supported). Run: npx expo run:android',
    };
  }

  try {
    const raw = (await RazorpayCheckout.open(buildCheckoutOptions(order))) as RazorpaySuccess;

    const paymentId = String(raw.razorpay_payment_id ?? '').trim();
    const orderId = String(raw.razorpay_order_id ?? '').trim();
    const signature = String(raw.razorpay_signature ?? '').trim();
    if (!paymentId || !orderId || !signature) {
      return { type: 'error', message: 'Incomplete payment response from Razorpay' };
    }
    return {
      type: 'success',
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      razorpay_signature: signature,
    };
  } catch (e: unknown) {
    const err = (e ?? {}) as RazorpayFailure;
    if (isUserCancel(err)) return { type: 'cancel' };
    const message = String(
      err.description ?? err.error?.description ?? err.message ?? err.error?.reason ?? 'Payment failed',
    );
    return { type: 'error', message };
  }
}
