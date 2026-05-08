import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import AudioVerificationScreen from '../screens/completeProfile/AudioVerificationScreen';
import BankDetailsScreen from '../screens/completeProfile/BankDetailsScreen';
import DocumentUploadScreen from '../screens/completeProfile/DocumentUploadScreen';
import ProfileInfoScreen from '../screens/completeProfile/ProfileInfoScreen';
import type { CompleteProfileStackParamList } from './CompleteProfileStackParamList';

const Stack = createNativeStackNavigator<CompleteProfileStackParamList>();

export default function CompleteProfileNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="ProfileInfo"
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="ProfileInfo" component={ProfileInfoScreen} />
      <Stack.Screen name="DocumentUpload" component={DocumentUploadScreen} />
      <Stack.Screen name="BankDetails" component={BankDetailsScreen} />
      <Stack.Screen name="AudioVerification" component={AudioVerificationScreen} />
    </Stack.Navigator>
  );
}
