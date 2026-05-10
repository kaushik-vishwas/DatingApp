import React, { useEffect, useRef } from 'react';

import { useAuth } from '../context/AuthContext';
import { CompleteProfileProvider, useCompleteProfile } from '../context/CompleteProfileContext';
import { receiverKycHydrationPatch } from '../utils/receiverKycHydration';
import CompleteProfileNavigator from './CompleteProfileNavigator';

/** Load partial KYC already stored on the server (after step 1 / 2) into wizard state once. */
function HydrateReceiverKycFromServer(): React.JSX.Element | null {
  const { user } = useAuth();
  const { update } = useCompleteProfile();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    if (!user) return;
    if (user.role !== 'receiver' || user.accountStatus !== 'pending_profile') {
      hydratedRef.current = true;
      return;
    }
    const patch = receiverKycHydrationPatch(user);
    if (Object.keys(patch).length > 0) {
      update(patch);
    }
    hydratedRef.current = true;
  }, [user, update]);

  return null;
}

/**
 * Multi-step Complete Profile wizard (after email verification).
 */
export default function CompleteProfileFlow(): React.JSX.Element {
  return (
    <CompleteProfileProvider>
      <HydrateReceiverKycFromServer />
      <CompleteProfileNavigator />
    </CompleteProfileProvider>
  );
}
