import type { CompleteProfileState } from '../context/CompleteProfileContext';

/** Page 1: profile image, name, languages, interests */
export function validateProfileInfo(state: CompleteProfileState): string | null {
  if (!state.profileImageUri) return 'Please add a profile picture';
  const n = state.displayName.trim();
  if (n.length < 2) return 'Enter your name (at least 2 characters)';
  if (state.languages.length === 0) return 'Select at least one language';
  if (state.languages.length > 2) return 'Select up to 2 languages';
  if (state.interests.length === 0) return 'Select at least one interest';
  if (state.interests.length > 3) return 'Select up to 3 interests';
  if (!state.gender) return 'Select your gender';
  if (!state.state.trim()) return 'Select your state';
  return null;
}

/** Page 2: Aadhaar front + back */
export function validateAadhaarDocuments(state: CompleteProfileState): string | null {
  if (!state.aadhaarFront) return 'Please upload the front side of your Aadhaar';
  if (!state.aadhaarBack) return 'Please upload the back side of your Aadhaar';
  const aadhaar = state.aadhaarNumber.trim();
  if (!/^\d{12}$/.test(aadhaar)) return 'Enter a valid 12-digit Aadhaar number';
  const pan = state.panNumber.trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return 'Enter a valid PAN number (e.g. ABCDE1234F)';
  if (!state.panFront) return 'Please upload the front side of your PAN card';
  return null;
}

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

/** Page 3: bank details */
export function validateBankDetails(state: CompleteProfileState): string | null {
  const holder = state.bankAccountHolderName.trim();
  if (holder.length < 2) return 'Enter account holder name as per bank records';
  const acct = state.bankAccountNumber.trim();
  const confirm = state.bankConfirmAccountNumber.trim();
  if (acct.length < 5) return 'Enter a valid account number';
  if (acct !== confirm) return 'Account numbers do not match';
  const ifsc = state.bankIfsc.trim().toUpperCase();
  if (!IFSC_RE.test(ifsc)) return 'Enter a valid 11-character IFSC code';
  const bank = state.bankName.trim();
  if (bank.length < 2) return 'Enter bank name';
  return null;
}

/** Full wizard (used on final submit) */
export function validateCompleteProfile(state: CompleteProfileState): string | null {
  return (
    validateProfileInfo(state) ||
    validateAadhaarDocuments(state) ||
    validateBankDetails(state)
  );
}
