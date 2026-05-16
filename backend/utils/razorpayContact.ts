/** Razorpay contact API requires an email; derive a stable placeholder from phone (not stored on user). */
export function razorpayContactEmailFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10) || '0000000000';
  return `payout+91${digits}@nesthama.app`;
}
