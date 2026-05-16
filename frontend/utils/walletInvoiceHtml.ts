import type { CallerWalletTopupRow } from '../types/api';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildWalletTopupInvoiceHtml(
  row: CallerWalletTopupRow,
  opts: { customerName: string }
): string {
  const name = escapeHtml(opts.customerName.trim() || 'Customer');
  const when = escapeHtml(new Date(row.createdAt).toLocaleString('en-IN'));
  const orderId = escapeHtml(row.razorpayOrderId);
  const payId = escapeHtml(row.razorpayPaymentId);
  const invId = escapeHtml(row.id);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 28px; color: #111; }
    h1 { font-size: 20px; margin: 0 0 16px; color: #111; }
    .meta { font-size: 12px; color: #555; margin-bottom: 20px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e5e5; }
    th { color: #555; font-weight: 600; width: 38%; }
    .total { font-weight: 800; font-size: 15px; }
    .muted { color: #666; font-size: 11px; margin-top: 24px; line-height: 1.5; }
  </style>
</head>
<body>
  <h1>Wallet recharge — invoice</h1>
  <div class="meta">
    <div><strong>Bill to:</strong> ${name}</div>
    <div><strong>Date:</strong> ${when}</div>
    <div><strong>Invoice ref:</strong> ${invId}</div>
  </div>
  <table>
    <tbody>
      <tr><th>Amount paid (INR)</th><td>₹${escapeHtml(String(row.payAmount))}</td></tr>
      <tr><th>Bonus</th><td>${escapeHtml(String(row.bonusPercent))}%</td></tr>
      <tr><th class="total">Wallet credit (INR)</th><td class="total">₹${escapeHtml(String(row.creditAdded))}</td></tr>
      <tr><th>Razorpay order</th><td style="word-break: break-all;">${orderId}</td></tr>
      <tr><th>Razorpay payment</th><td style="word-break: break-all;">${payId}</td></tr>
    </tbody>
  </table>
  <div class="muted">
    This document is a statement of your in-app wallet top-up. For payment disputes, refer to your Razorpay receipt or bank statement.
  </div>
</body>
</html>
`.trim();
}
