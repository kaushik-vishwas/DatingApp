import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OnboardingLogoutButton from '../components/auth/OnboardingLogoutButton';
import { ReceiverOnboardingProvider, useReceiverOnboarding } from '../context/ReceiverOnboardingContext';
import { useAuth } from '../context/AuthContext';
import type { Gender } from '../types/user';
import ReceiverOnboardingNavigator from './ReceiverOnboardingNavigator';

type Props = {
  initialGender?: Gender | null;
};

function ReceiverOnboardingBootstrap({ initialGender }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { setGender, gender } = useReceiverOnboarding();

  useEffect(() => {
    const g = initialGender ?? (user?.gender as Gender | null) ?? null;
    if (g && !gender) {
      setGender(g);
    }
  }, [initialGender, user?.gender, gender, setGender]);

  return (
    <View style={styles.root}>
      <ReceiverOnboardingNavigator />
      <OnboardingLogoutButton
        style={{ paddingTop: Math.max(insets.top, 12) + 4, paddingRight: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default function ReceiverOnboardingFlow({ initialGender }: Props): React.JSX.Element {
  return (
    <ReceiverOnboardingProvider>
      <ReceiverOnboardingBootstrap initialGender={initialGender ?? null} />
    </ReceiverOnboardingProvider>
  );
}
