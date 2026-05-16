import React, { useEffect } from 'react';

import { ReceiverOnboardingProvider, useReceiverOnboarding } from '../context/ReceiverOnboardingContext';
import { useAuth } from '../context/AuthContext';
import type { Gender } from '../types/user';
import ReceiverOnboardingNavigator from './ReceiverOnboardingNavigator';

type Props = {
  initialGender?: Gender | null;
};

function ReceiverOnboardingBootstrap({ initialGender }: Props): React.JSX.Element {
  const { user } = useAuth();
  const { setGender, gender } = useReceiverOnboarding();

  useEffect(() => {
    const g = initialGender ?? (user?.gender as Gender | null) ?? null;
    if (g && !gender) {
      setGender(g);
    }
  }, [initialGender, user?.gender, gender, setGender]);

  return <ReceiverOnboardingNavigator />;
}

export default function ReceiverOnboardingFlow({ initialGender }: Props): React.JSX.Element {
  return (
    <ReceiverOnboardingProvider>
      <ReceiverOnboardingBootstrap initialGender={initialGender ?? null} />
    </ReceiverOnboardingProvider>
  );
}
