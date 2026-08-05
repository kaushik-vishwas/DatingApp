export function normalizeUpiId(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function isValidUpiId(upi: string): boolean {
  return /^[a-z0-9._-]{2,256}@[a-z]{3,}$/i.test(upi);
}

export function isValidPanNumber(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase());
}

export function isValidIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc.trim());
}

export function normalizeBankAccountNumber(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function receiverHasValidUpi(r: { upiId?: string | null }): boolean {
  const upi = normalizeUpiId(r.upiId);
  return Boolean(upi && isValidUpiId(upi));
}

export function receiverHasValidBank(r: {
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  nameAsPerAadhaar?: string | null;
  bankAccountHolderName?: string | null;
}): boolean {
  const acct = normalizeBankAccountNumber(r.bankAccountNumber);
  const ifsc = String(r.bankIfsc ?? '').trim().toUpperCase();
  return Boolean(acct.length >= 9 && isValidIfsc(ifsc));
}

/** UPI or bank required; Aadhaar name/number optional (if provided must be valid); PAN optional. */
export function receiverPaymentDetailsComplete(r: {
  nameAsPerAadhaar?: string | null;
  upiId?: string | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankAccountHolderName?: string | null;
}): boolean {
  const aadhaarDigits = String(r.aadhaarNumber ?? '').replace(/\D/g, '');
  const aadhaarOk = !aadhaarDigits || /^\d{12}$/.test(aadhaarDigits);
  const pan = String(r.panNumber ?? '').trim().toUpperCase();
  const panOk = !pan || isValidPanNumber(pan);
  const payoutMethod = receiverHasValidUpi(r) || receiverHasValidBank(r);
  return Boolean(aadhaarOk && panOk && payoutMethod);
}

export type ReceiverPaymentUpdateInput = {
  nameAsPerAadhaar?: unknown;
  upiId?: unknown;
  aadhaarNumber?: unknown;
  panNumber?: unknown;
  bankAccountNumber?: unknown;
  bankIfsc?: unknown;
  payoutMethod?: unknown;
};

export type ParsedReceiverPaymentUpdate =
  | {
      nameAsPerAadhaar: string | null;
      aadhaarDigits: string | null;
      pan: string | null;
      upiId: string | null;
      bankAccountNumber: string | null;
      bankIfsc: string | null;
      bankAccountHolderName: string | null;
    }
  | { error: string };

export function parseReceiverPaymentUpdateBody(body: ReceiverPaymentUpdateInput): ParsedReceiverPaymentUpdate {
  const nameAsPerAadhaarRaw = String(body.nameAsPerAadhaar ?? '').trim();
  const nameAsPerAadhaar = nameAsPerAadhaarRaw || null;

  const aadhaarDigitsRaw = String(body.aadhaarNumber ?? '').replace(/\D/g, '');
  if (aadhaarDigitsRaw && !/^\d{12}$/.test(aadhaarDigitsRaw)) {
    return { error: 'Aadhaar number must be 12 digits' };
  }
  const aadhaarDigits = aadhaarDigitsRaw || null;

  const panRaw = String(body.panNumber ?? '').trim().toUpperCase();
  const pan = panRaw || null;
  if (pan && !isValidPanNumber(pan)) {
    return { error: 'Enter a valid PAN (e.g. ABCDE1234F)' };
  }

  const upiRaw = normalizeUpiId(body.upiId);
  if (upiRaw && !isValidUpiId(upiRaw)) {
    return { error: 'Enter a valid UPI ID (e.g. name@bank)' };
  }
  const upiId = upiRaw && isValidUpiId(upiRaw) ? upiRaw : null;

  const bankAccountNumber = normalizeBankAccountNumber(body.bankAccountNumber);
  const bankIfsc = String(body.bankIfsc ?? '').trim().toUpperCase();
  const hasBankFields = bankAccountNumber.length > 0 || bankIfsc.length > 0;

  if (hasBankFields) {
    if (bankAccountNumber.length < 9) {
      return { error: 'Enter a valid bank account number' };
    }
    if (!isValidIfsc(bankIfsc)) {
      return { error: 'Enter a valid 11-character IFSC code' };
    }
  }

  const hasUpi = Boolean(upiId);
  const hasValidBank = hasBankFields && bankAccountNumber.length >= 9 && isValidIfsc(bankIfsc);

  const methodRaw = String(body.payoutMethod ?? '').trim().toLowerCase();
  const explicitMethod = methodRaw === 'upi' || methodRaw === 'bank' ? methodRaw : null;

  if (explicitMethod === 'upi') {
    if (!hasUpi) return { error: 'Enter a valid UPI ID (e.g. name@bank)' };
    return {
      nameAsPerAadhaar,
      aadhaarDigits,
      pan,
      upiId,
      bankAccountNumber: null,
      bankIfsc: null,
      bankAccountHolderName: null,
    };
  }

  if (explicitMethod === 'bank') {
    if (!hasValidBank) return { error: 'Enter a valid bank account number with IFSC' };
    return {
      nameAsPerAadhaar,
      aadhaarDigits,
      pan,
      upiId: null,
      bankAccountNumber,
      bankIfsc,
      bankAccountHolderName: nameAsPerAadhaar,
    };
  }

  if (!hasUpi && !hasValidBank) {
    return { error: 'Enter a valid UPI ID or bank account number with IFSC' };
  }

  return {
    nameAsPerAadhaar,
    aadhaarDigits,
    pan,
    upiId: hasUpi ? upiId : null,
    bankAccountNumber: hasValidBank ? bankAccountNumber : null,
    bankIfsc: hasValidBank ? bankIfsc : null,
    bankAccountHolderName: hasValidBank ? nameAsPerAadhaar : null,
  };
}
