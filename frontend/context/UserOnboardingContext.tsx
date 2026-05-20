import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from './AuthContext';
import type { Gender } from '../types/user';

type UserOnboardingContextValue = {
  gender: Gender | null;
  setGender: (g: Gender) => void;
  /** Preset avatar id chosen before complete profile (e.g. preset:female:3). */
  callerAvatarPresetUrl: string | null;
  setCallerAvatarPresetUrl: (url: string | null) => void;
  /** HTTPS URL after Cloudinary upload (also persisted on server as `userAudio`). */
  userAudio: string | null;
  setUserAudio: (url: string | null) => void;
  reset: () => void;
};

const UserOnboardingContext = createContext<UserOnboardingContextValue | null>(null);

export const UserOnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [gender, setGenderState] = useState<Gender | null>(() => user?.gender ?? null);
  const [callerAvatarPresetUrl, setCallerAvatarPresetUrl] = useState<string | null>(null);
  const [userAudio, setUserAudio] = useState<string | null>(null);

  useEffect(() => {
    if (user?.gender) {
      setGenderState(user.gender);
    }
  }, [user?.gender]);

  const setGender = useCallback((g: Gender) => {
    setGenderState(g);
    if (g !== 'female') {
      setUserAudio(null);
    }
  }, []);

  const reset = useCallback(() => {
    setGenderState(null);
    setCallerAvatarPresetUrl(null);
    setUserAudio(null);
  }, []);

  const value = useMemo(
    () => ({
      gender,
      setGender,
      callerAvatarPresetUrl,
      setCallerAvatarPresetUrl,
      userAudio,
      setUserAudio,
      reset,
    }),
    [gender, setGender, callerAvatarPresetUrl, userAudio, reset]
  );

  return <UserOnboardingContext.Provider value={value}>{children}</UserOnboardingContext.Provider>;
};

export const useUserOnboarding = (): UserOnboardingContextValue => {
  const ctx = useContext(UserOnboardingContext);
  if (!ctx) {
    throw new Error('useUserOnboarding must be used within UserOnboardingProvider');
  }
  return ctx;
};
