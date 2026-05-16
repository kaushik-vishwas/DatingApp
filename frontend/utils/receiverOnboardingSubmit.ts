import { profileApi } from '../services/api';
import { navigationRef } from '../navigation/navigationRef';
import type { UserProfile } from '../types/user';
import {
  RECEIVER_ONBOARDING_DEFAULT_INTERESTS,
  RECEIVER_ONBOARDING_DEFAULT_STATE,
} from '../context/ReceiverOnboardingContext';

export type ReceiverOnboardingDraft = {
  nickname: string;
  birthYear: number;
  profileImageUri: string;
  primaryLanguage: string;
  secondaryLanguage: string | null;
  gender: 'male' | 'female' | 'other';
};

export function computeAgeFromBirthYear(birthYear: number): number {
  const currentYear = new Date().getFullYear();
  return Math.max(18, currentYear - birthYear);
}

export function buildLanguagesList(primary: string, secondary: string | null): string[] {
  const list = [primary.trim()];
  if (secondary && secondary.trim() && secondary.trim() !== primary.trim()) {
    list.push(secondary.trim());
  }
  return list;
}

export async function submitReceiverOnboardingProfile(
  draft: ReceiverOnboardingDraft
): Promise<UserProfile> {
  const languages = buildLanguagesList(draft.primaryLanguage, draft.secondaryLanguage);
  const { data } = await profileApi.updateReceiverProfile({
    name: draft.nickname.trim(),
    profileImage: draft.profileImageUri.trim(),
    languages,
    interests: [...RECEIVER_ONBOARDING_DEFAULT_INTERESTS],
    state: RECEIVER_ONBOARDING_DEFAULT_STATE,
    gender: draft.gender,
    age: computeAgeFromBirthYear(draft.birthYear),
  });
  return data.user;
}

export function goToReceiverAudioVerification(): void {
  const nav = navigationRef.current;
  if (!nav?.isReady()) return;
  nav.navigate('Home', { screen: 'ReceiverAutoVerification' });
}
