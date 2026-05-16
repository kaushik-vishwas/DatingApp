import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { Gender } from '../types/user';

export const RECEIVER_ONBOARDING_LANGUAGE_OPTIONS = [
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Kannada',
  'Bengali',
  'Marathi',
] as const;

/** Satisfies backend `receiverOnboardingProfileFieldsComplete` when not collected in UI. */
export const RECEIVER_ONBOARDING_DEFAULT_STATE = 'India';
export const RECEIVER_ONBOARDING_DEFAULT_INTERESTS = ['Friendship'];

type ReceiverOnboardingContextValue = {
  gender: Gender | null;
  setGender: (g: Gender) => void;
  nickname: string;
  setNickname: (v: string) => void;
  birthYear: number | null;
  setBirthYear: (y: number | null) => void;
  profileImageUri: string | null;
  setProfileImageUri: (v: string | null) => void;
  primaryLanguage: string | null;
  setPrimaryLanguage: (v: string | null) => void;
  secondaryLanguage: string | null;
  setSecondaryLanguage: (v: string | null) => void;
  reset: () => void;
};

const ReceiverOnboardingContext = createContext<ReceiverOnboardingContextValue | null>(null);

export const ReceiverOnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gender, setGenderState] = useState<Gender | null>(null);
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [primaryLanguage, setPrimaryLanguage] = useState<string | null>(null);
  const [secondaryLanguage, setSecondaryLanguage] = useState<string | null>(null);

  const setGender = useCallback((g: Gender) => {
    setGenderState(g);
  }, []);

  const reset = useCallback(() => {
    setGenderState(null);
    setNickname('');
    setBirthYear(null);
    setProfileImageUri(null);
    setPrimaryLanguage(null);
    setSecondaryLanguage(null);
  }, []);

  const value = useMemo(
    () => ({
      gender,
      setGender,
      nickname,
      setNickname,
      birthYear,
      setBirthYear,
      profileImageUri,
      setProfileImageUri,
      primaryLanguage,
      setPrimaryLanguage,
      secondaryLanguage,
      setSecondaryLanguage,
      reset,
    }),
    [
      gender,
      nickname,
      birthYear,
      profileImageUri,
      primaryLanguage,
      secondaryLanguage,
      reset,
    ]
  );

  return (
    <ReceiverOnboardingContext.Provider value={value}>{children}</ReceiverOnboardingContext.Provider>
  );
};

export const useReceiverOnboarding = (): ReceiverOnboardingContextValue => {
  const ctx = useContext(ReceiverOnboardingContext);
  if (!ctx) {
    throw new Error('useReceiverOnboarding must be used within ReceiverOnboardingProvider');
  }
  return ctx;
};
