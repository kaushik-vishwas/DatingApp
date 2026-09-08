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

export type RazorpayCheckoutPrefill = {
  name?: string | null;
  contact?: string | null;
  email?: string | null;
};

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

/** Razorpay Checkout expects a 10-digit Indian mobile (no +91). */
export function normalizeRazorpayContact(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

/**
 * Build Standard Checkout options for maximum instrument coverage.
 *
 * Prefill contact/name from the logged-in caller so Razorpay does not ask for mobile every time.
 * UPI Intent first so installed apps (GPay, PhonePe, Paytm, Amazon Pay, …) list and open on tap.
 */
function buildCheckoutOptions(
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
          upi_apps: {
            name: 'Pay with UPI apps',
            instruments: [
              {
                method: 'upi',
                // intent = open GPay / PhonePe / Paytm / Amazon Pay / BHIM etc. directly
                flows: ['intent'],
              },
            ],
          },
          other: {
            name: 'Other ways to pay',
            instruments: [
              { method: 'upi', flows: ['collect', 'qr'] },
              { method: 'card' },
              { method: 'netbanking' },
              { method: 'wallet' },
            ],
          },
        },
        sequence: ['block.upi_apps', 'block.other'],
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
  prefill?: RazorpayCheckoutPrefill,
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
    const raw = (await RazorpayCheckout.open(buildCheckoutOptions(order, prefill))) as RazorpaySuccess;

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
