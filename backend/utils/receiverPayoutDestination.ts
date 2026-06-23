import {
  normalizeBankAccountNumber,
  normalizeUpiId,
  receiverHasValidBank,
  receiverHasValidUpi,
} from './receiverPaymentDetails';

export type ReceiverPayoutMethod = 'upi' | 'bank';
export type BankPayoutMode = 'IMPS' | 'NEFT' | 'RTGS';

export type RazorpayPayoutContact = {
  name: string;
  email: string;
  contact: string;
  type: string;
  reference_id: string;
};

export type RazorpayPayoutFundAccount =
  | {
      account_type: 'bank_account';
      bank_account: { name: string; ifsc: string; account_number: string };
      contact: RazorpayPayoutContact;
    }
  | {
      account_type: 'vpa';
      vpa: { address: string };
      contact: RazorpayPayoutContact;
    };

export type ResolvedReceiverPayoutDestination = {
  payoutMethod: ReceiverPayoutMethod;
  mode: 'UPI' | BankPayoutMode;
  fundAccount: RazorpayPayoutFundAccount;
};

function safeTrim(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

/** Prefer UPI when both are on file unless a withdrawal snapshot says otherwise. */
export function inferReceiverPayoutMethod(receiver: {
  upiId?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  nameAsPerAadhaar?: string | null;
  bankAccountHolderName?: string | null;
}): ReceiverPayoutMethod | null {
  if (receiverHasValidUpi(receiver)) return 'upi';
  if (receiverHasValidBank(receiver)) return 'bank';
  return null;
}

export function resolveBankPayoutMode(): BankPayoutMode {
  const raw =
    process.env.RAZORPAYX_BANK_PAYOUT_MODE?.trim().toUpperCase() ||
    process.env.RAZORPAYX_PAYOUT_MODE?.trim().toUpperCase();
  if (raw === 'NEFT' || raw === 'RTGS') return raw;
  return 'IMPS';
}

export function resolveReceiverPayoutDestination(options: {
  receiver: {
    _id: unknown;
    name?: string | null;
    phone?: string | null;
    nameAsPerAadhaar?: string | null;
    upiId?: string | null;
    bankAccountHolderName?: string | null;
    bankAccountNumber?: string | null;
    bankIfsc?: string | null;
  };
  contactEmail: string;
  preferredMethod?: ReceiverPayoutMethod | null;
}): ResolvedReceiverPayoutDestination | null {
  const { receiver, contactEmail, preferredMethod } = options;
  const payeeName =
    safeTrim(receiver.nameAsPerAadhaar) ||
    safeTrim(receiver.bankAccountHolderName) ||
    safeTrim(receiver.name);
  const phone = safeTrim(receiver.phone);
  if (!payeeName || !phone) return null;

  let method: ReceiverPayoutMethod | null = null;
  if (preferredMethod === 'upi' && receiverHasValidUpi(receiver)) method = 'upi';
  else if (preferredMethod === 'bank' && receiverHasValidBank(receiver)) method = 'bank';
  else method = inferReceiverPayoutMethod(receiver);
  if (!method) return null;

  const contact: RazorpayPayoutContact = {
    name: payeeName,
    email: contactEmail,
    contact: phone.replace(/\D/g, '').slice(-10),
    type: 'customer',
    reference_id: `recv_${String(receiver._id).slice(-10)}`.slice(0, 40),
  };

  if (method === 'upi') {
    const upiId = normalizeUpiId(receiver.upiId);
    if (!upiId) return null;
    return {
      payoutMethod: 'upi',
      mode: 'UPI',
      fundAccount: {
        account_type: 'vpa',
        vpa: { address: upiId },
        contact,
      },
    };
  }

  const accountNumber = normalizeBankAccountNumber(receiver.bankAccountNumber);
  const ifsc = safeTrim(receiver.bankIfsc).toUpperCase();
  if (!accountNumber || !ifsc) return null;

  return {
    payoutMethod: 'bank',
    mode: resolveBankPayoutMode(),
    fundAccount: {
      account_type: 'bank_account',
      bank_account: {
        name: safeTrim(receiver.bankAccountHolderName) || payeeName,
        ifsc,
        account_number: accountNumber,
      },
      contact,
    },
  };
}
