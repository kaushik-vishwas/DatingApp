import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import AudioVerificationScreen from '../screens/userOnboarding/AudioVerificationScreen';
import ChooseAvatarScreen from '../screens/userOnboarding/ChooseAvatarScreen';
import OnboardingSelectGenderScreen from '../screens/userOnboarding/OnboardingSelectGenderScreen';
import UserCompleteProfileScreen from '../screens/userOnboarding/UserCompleteProfileScreen';
import WelcomeOnboardScreen from '../screens/userOnboarding/WelcomeOnboardScreen';
import type { UserOnboardingStackParamList } from './UserOnboardingStackParamList';

const Stack = createNativeStackNavigator<UserOnboardingStackParamList>();

export default function UserOnboardingNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="ChooseAvatar"
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="AudioVerification" component={AudioVerificationScreen} />
      <Stack.Screen name="SelectGender" component={OnboardingSelectGenderScreen} />
      <Stack.Screen name="ChooseAvatar" component={ChooseAvatarScreen} />
      <Stack.Screen name="UserCompleteProfile" component={UserCompleteProfileScreen} />
      <Stack.Screen name="WelcomeOnboard" component={WelcomeOnboardScreen} />
    </Stack.Navigator>
  );
}
