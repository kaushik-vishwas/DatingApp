import type { User } from '../types/user';

export function isValidUpiId(upi: string): boolean {
  return /^[a-z0-9._-]{2,256}@[a-z]{3,}$/i.test(upi.trim());
}

export function isValidAadhaarNumber(value: string): boolean {
  return /^\d{12}$/.test(value.replace(/\D/g, ''));
}

export function isValidPanNumber(value: string): boolean {
  const pan = value.trim().toUpperCase();
  if (!pan) return true;
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

export function isValidIfsc(value: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(value.trim());
}

export function normalizeBankAccountNumber(value: string): string {
  return value.replace(/\D/g, '');
}

export function receiverHasValidUpi(user: {
  upiId?: string | null;
}): boolean {
  const upi = String(user.upiId ?? '').trim().toLowerCase();
  return Boolean(upi && isValidUpiId(upi));
}

export function receiverHasValidBank(user: {
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  nameAsPerAadhaar?: string | null;
  bankAccountHolderName?: string | null;
}): boolean {
  const acct = normalizeBankAccountNumber(String(user.bankAccountNumber ?? ''));
  const ifsc = String(user.bankIfsc ?? '').trim();
  return Boolean(acct.length >= 9 && isValidIfsc(ifsc));
}

export function receiverPaymentDetailsComplete(user: User | null | undefined): boolean {
  if (!user) return false;
  const pan = String(user.panNumber ?? '').trim();
  const aadhaarRaw = String(user.aadhaarNumber ?? '').replace(/\D/g, '');
  const aadhaarOk = !aadhaarRaw || isValidAadhaarNumber(aadhaarRaw);
  return Boolean(
    aadhaarOk &&
      isValidPanNumber(pan) &&
      (receiverHasValidUpi(user) || receiverHasValidBank(user)),
  );
}

export type ReceiverPayoutMethod = 'upi' | 'bank';

export type ReceiverPaymentFormInput = {
  nameAsPerAadhaar: string;
  aadhaarNumber: string;
  panNumber: string;
  upiId: string;
  bankAccountNumber: string;
  bankIfsc: string;
};

function receiverIdentityFieldsValid(
  input: Pick<ReceiverPaymentFormInput, 'nameAsPerAadhaar' | 'aadhaarNumber' | 'panNumber'>,
): boolean {
  const aadhaarRaw = input.aadhaarNumber.replace(/\D/g, '');
  const aadhaarOk = !aadhaarRaw || isValidAadhaarNumber(aadhaarRaw);
  return Boolean(aadhaarOk && isValidPanNumber(input.panNumber));
}

export function receiverPaymentFormValid(
  input: ReceiverPaymentFormInput,
  method: ReceiverPayoutMethod,
): boolean {
  if (!receiverIdentityFieldsValid(input)) return false;
  if (method === 'upi') {
    const upi = input.upiId.trim().toLowerCase();
    return Boolean(upi && isValidUpiId(upi));
  }
  const acct = normalizeBankAccountNumber(input.bankAccountNumber);
  const ifsc = input.bankIfsc.trim();
  return Boolean(acct.length >= 9 && isValidIfsc(ifsc));
}

/** @deprecated Use receiverPaymentFormValid with explicit method when validating a form step. */
export function receiverPaymentFormValidEither(input: ReceiverPaymentFormInput): boolean {
  const pan = input.panNumber.trim();
  const upi = input.upiId.trim().toLowerCase();
  const hasUpi = Boolean(upi && isValidUpiId(upi));
  const acct = normalizeBankAccountNumber(input.bankAccountNumber);
  const ifsc = input.bankIfsc.trim();
  const hasBank = Boolean(acct.length >= 9 && isValidIfsc(ifsc));
  const aadhaarRaw = input.aadhaarNumber.replace(/\D/g, '');
  const aadhaarOk = !aadhaarRaw || isValidAadhaarNumber(aadhaarRaw);

  return Boolean(aadhaarOk && isValidPanNumber(pan) && (hasUpi || hasBank));
}
