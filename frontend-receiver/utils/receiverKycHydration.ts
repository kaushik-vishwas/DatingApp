import type { CompleteProfileState } from '../context/CompleteProfileContext';
import type { UserProfile } from '../types/user';

/** Merge server-saved KYC into wizard state when (re)opening the flow. */
export function receiverKycHydrationPatch(user: UserProfile): Partial<CompleteProfileState> {
  if (user.role !== 'receiver' || user.accountStatus !== 'pending_profile') {
    return {};
  }
  const patch: Partial<CompleteProfileState> = {};

  if (user.name?.trim()) patch.displayName = user.name.trim();
  if (user.profileImage?.trim()) {
    patch.profileImageUri = user.profileImage.trim();
    patch.profileImageMime = 'image/jpeg';
  }
  if (user.languages?.length) patch.languages = [...user.languages];
  if (user.interests?.length) patch.interests = [...user.interests];
  if (user.gender) patch.gender = user.gender;
  if (user.state?.trim()) patch.state = user.state.trim();

  if (user.aadhaarNumber?.trim()) patch.aadhaarNumber = user.aadhaarNumber.replace(/\D/g, '').slice(0, 12);
  if (user.panNumber?.trim()) patch.panNumber = user.panNumber.trim().toUpperCase();

  if (user.aadhaarFront?.trim()) {
    patch.aadhaarFront = {
      uri: user.aadhaarFront.trim(),
      name: 'aadhaar-front',
      mimeType: 'image/jpeg',
    };
  }
  if (user.aadhaarBack?.trim()) {
    patch.aadhaarBack = {
      uri: user.aadhaarBack.trim(),
      name: 'aadhaar-back',
      mimeType: 'image/jpeg',
    };
  }
  if (user.panFront?.trim()) {
    patch.panFront = {
      uri: user.panFront.trim(),
      name: 'pan-front',
      mimeType: 'image/jpeg',
    };
  }

  if (user.bankAccountHolderName?.trim()) patch.bankAccountHolderName = user.bankAccountHolderName.trim();
  if (user.bankAccountType === 'savings' || user.bankAccountType === 'current') {
    patch.bankAccountType = user.bankAccountType;
  }
  if (user.bankAccountNumber?.trim()) {
    patch.bankAccountNumber = user.bankAccountNumber.trim();
    patch.bankConfirmAccountNumber = user.bankAccountNumber.trim();
  }
  if (user.bankIfsc?.trim()) patch.bankIfsc = user.bankIfsc.trim().toUpperCase();
  if (user.bankName?.trim()) patch.bankName = user.bankName.trim();

  return patch;
}
