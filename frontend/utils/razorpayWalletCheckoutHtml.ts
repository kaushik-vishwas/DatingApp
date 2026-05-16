import type { RazorpayOrderResponse } from '../types/api';

/** Keep only plausible digits for Razorpay prefill (bad values can break checkout). */
function sanitizeContact(raw: string): string | undefined {
  const d = raw.replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 15) return d;
  return undefined;
}

/**
 * Inline HTML for Razorpay Checkout inside WebView; posts JSON messages to React Native.
 *
 * Notes:
 * - Do not pass `method` here: restricting e.g. UPI-only breaks inside WebView (no UPI intent).
 * - Pass `amount` / `currency` exactly as returned with the order so they always match the order.
 */
export function buildRazorpayWalletCheckoutHtml(order: RazorpayOrderResponse): string {
  const prefill: Record<string, string> = {};
  const contact = order.prefillContact ? sanitizeContact(order.prefillContact) : undefined;
  if (contact) prefill.contact = contact;
  if (order.prefillName?.trim()) prefill.name = order.prefillName.trim();

  const staticPart: Record<string, unknown> = {
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: order.businessName,
    description: 'Wallet recharge',
    order_id: order.orderId,
    theme: { color: '#7b2cff' },
    method: {
      upi: true,
      card: true,
      netbanking: true,
      wallet: true,
      emi: true,
      paylater: true,
    },
    config: {
      display: {
        blocks: {
          upi: {
            name: 'Pay using UPI',
            instruments: [{ method: 'upi' }],
          },
          cards: {
            name: 'Pay using Card',
            instruments: [{ method: 'card' }],
          },
          netbanking: {
            name: 'Netbanking',
            instruments: [{ method: 'netbanking' }],
          },
        },
        sequence: ['block.upi', 'block.cards', 'block.netbanking'],
        preferences: {
          show_default_blocks: true,
        },
      },
    },
  };
  if (Object.keys(prefill).length > 0) staticPart.prefill = prefill;

  const staticJson = JSON.stringify(staticPart).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head><body>
<script>
(function(){
  var STATIC = ${staticJson};
  function send(payload) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {}
  }
  function start() {
    if (typeof Razorpay === 'undefined') { setTimeout(start, 50); return; }
    var options = Object.assign({}, STATIC, {
      handler: function (res) {
        send({
          type: 'success',
          razorpay_payment_id: res.razorpay_payment_id,
          razorpay_order_id: res.razorpay_order_id,
          razorpay_signature: res.razorpay_signature
        });
      },
      modal: {
        ondismiss: function () { send({ type: 'dismiss' }); }
      }
    });
    try {
      new Razorpay(options).open();
    } catch (e) {
      send({ type: 'error', message: String(e && e.message ? e.message : e) });
    }
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
</script></body></html>`;
}

export type RazorpayWebViewMessage =
  | { type: 'success'; razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
  | { type: 'dismiss' }
  | { type: 'error'; message: string };

export function parseRazorpayWebViewMessage(raw: string): RazorpayWebViewMessage | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return null;
    const o = v as { type?: string };
    if (o.type === 'dismiss') return { type: 'dismiss' };
    if (o.type === 'error' && typeof (o as { message?: unknown }).message === 'string') {
      return { type: 'error', message: (o as { message: string }).message };
    }
    if (o.type === 'success') {
      const s = o as {
        razorpay_payment_id?: unknown;
        razorpay_order_id?: unknown;
        razorpay_signature?: unknown;
      };
      if (
        typeof s.razorpay_payment_id === 'string' &&
        typeof s.razorpay_order_id === 'string' &&
        typeof s.razorpay_signature === 'string'
      ) {
        return {
          type: 'success',
          razorpay_payment_id: s.razorpay_payment_id,
          razorpay_order_id: s.razorpay_order_id,
          razorpay_signature: s.razorpay_signature,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
