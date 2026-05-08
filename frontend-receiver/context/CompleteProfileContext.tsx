import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { Gender } from '../types/user';

export type PickedDocument = {
  uri: string;
  name: string;
  mimeType: string;
};

export type BankAccountType = 'savings' | 'current';

export type CompleteProfileState = {
  displayName: string;
  profileImageUri: string | null;
  profileImageMime: string | null;
  languages: string[];
  interests: string[];
  gender: Gender | null;
  state: string;
  aadhaarFront: PickedDocument | null;
  aadhaarBack: PickedDocument | null;
  aadhaarNumber: string;
  panNumber: string;
  panFront: PickedDocument | null;
  bankAccountHolderName: string;
  bankAccountType: BankAccountType;
  bankAccountNumber: string;
  bankConfirmAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  userAudio: string | null;
};

const initialState: CompleteProfileState = {
  displayName: '',
  profileImageUri: null,
  profileImageMime: null,
  languages: [],
  interests: [],
  gender: null,
  state: '',
  aadhaarFront: null,
  aadhaarBack: null,
  aadhaarNumber: '',
  panNumber: '',
  panFront: null,
  bankAccountHolderName: '',
  bankAccountType: 'savings',
  bankAccountNumber: '',
  bankConfirmAccountNumber: '',
  bankIfsc: '',
  bankName: '',
  userAudio: null,
};

type CompleteProfileContextValue = {
  state: CompleteProfileState;
  update: (patch: Partial<CompleteProfileState>) => void;
  reset: () => void;
};

const CompleteProfileContext = createContext<CompleteProfileContextValue | null>(null);

export const CompleteProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CompleteProfileState>(initialState);

  const update = useCallback((patch: Partial<CompleteProfileState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const value = useMemo(
    () => ({ state, update, reset }),
    [state, update, reset]
  );

  return (
    <CompleteProfileContext.Provider value={value}>{children}</CompleteProfileContext.Provider>
  );
};

export const useCompleteProfile = (): CompleteProfileContextValue => {
  const ctx = useContext(CompleteProfileContext);
  if (!ctx) {
    throw new Error('useCompleteProfile must be used within CompleteProfileProvider');
  }
  return ctx;
};
