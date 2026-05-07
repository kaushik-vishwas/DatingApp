import React from 'react';

import { UserOnboardingProvider } from '../context/UserOnboardingContext';
import UserOnboardingNavigator from './UserOnboardingNavigator';

export default function UserOnboardingFlow(): React.JSX.Element {
  return (
    <UserOnboardingProvider>
      <UserOnboardingNavigator />
    </UserOnboardingProvider>
  );
}
