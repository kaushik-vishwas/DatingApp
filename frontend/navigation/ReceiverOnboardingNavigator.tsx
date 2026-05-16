import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import ReceiverOnboardingNicknameScreen from '../screens/receiver/onboarding/ReceiverOnboardingNicknameScreen';
import ReceiverOnboardingBirthYearScreen from '../screens/receiver/onboarding/ReceiverOnboardingBirthYearScreen';
import ReceiverOnboardingAvatarScreen from '../screens/receiver/onboarding/ReceiverOnboardingAvatarScreen';
import ReceiverOnboardingPrimaryLanguageScreen from '../screens/receiver/onboarding/ReceiverOnboardingPrimaryLanguageScreen';
import ReceiverOnboardingSecondaryLanguageScreen from '../screens/receiver/onboarding/ReceiverOnboardingSecondaryLanguageScreen';
import type { ReceiverOnboardingStackParamList } from './ReceiverOnboardingStackParamList';

const Stack = createNativeStackNavigator<ReceiverOnboardingStackParamList>();

export default function ReceiverOnboardingNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="ReceiverOnboardingNickname"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="ReceiverOnboardingNickname" component={ReceiverOnboardingNicknameScreen} />
      <Stack.Screen name="ReceiverOnboardingBirthYear" component={ReceiverOnboardingBirthYearScreen} />
      <Stack.Screen name="ReceiverOnboardingAvatar" component={ReceiverOnboardingAvatarScreen} />
      <Stack.Screen
        name="ReceiverOnboardingPrimaryLanguage"
        component={ReceiverOnboardingPrimaryLanguageScreen}
      />
      <Stack.Screen
        name="ReceiverOnboardingSecondaryLanguage"
        component={ReceiverOnboardingSecondaryLanguageScreen}
      />
    </Stack.Navigator>
  );
}
