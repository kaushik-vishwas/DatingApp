import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OnboardingLogoutButton from '../components/auth/OnboardingLogoutButton';
import { UserOnboardingProvider } from '../context/UserOnboardingContext';
import UserOnboardingNavigator from './UserOnboardingNavigator';

export default function UserOnboardingFlow(): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <UserOnboardingProvider>
      <View style={styles.root}>
        <UserOnboardingNavigator />
        <OnboardingLogoutButton
          style={{ paddingTop: Math.max(insets.top, 12) + 4, paddingRight: 20 }}
        />
      </View>
    </UserOnboardingProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
