import React, { useEffect } from 'react';

import { CompleteProfileProvider, useCompleteProfile } from '../context/CompleteProfileContext';
import CompleteProfileNavigator from './CompleteProfileNavigator';

function ResetOnMount({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { reset } = useCompleteProfile();
  useEffect(() => {
    reset();
  }, [reset]);
  return <>{children}</>;
}

/**
 * Multi-step Complete Profile wizard (after mobile OTP verification).
 */
export default function CompleteProfileFlow(): React.JSX.Element {
  return (
    <CompleteProfileProvider>
      <ResetOnMount>
        <CompleteProfileNavigator />
      </ResetOnMount>
    </CompleteProfileProvider>
  );
}
