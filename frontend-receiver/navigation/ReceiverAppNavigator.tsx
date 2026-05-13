import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ReceiverHomeDashboard from '../screens/ReceiverHomeDashboard';
import ReceiverChatsScreen from '../screens/receiver/ReceiverChatsScreen';
import ChatConversationScreen from '../screens/chat/ChatConversationScreen';
import IncomingCallScreen from '../screens/call/IncomingCallScreen';
import VoiceCallScreen from '../screens/call/VoiceCallScreen';
import WithdrawEarningsScreen from '../screens/receiver/WithdrawEarningsScreen';
import ReceiverCallHistoryScreen from '../screens/receiver/ReceiverCallHistoryScreen';
import ReceiverSettingsScreen from '../screens/receiver/ReceiverSettingsScreen';
import ReceiverNotificationsScreen from '../screens/receiver/ReceiverNotificationsScreen';
import ReceiverBankDetailsScreen from '../screens/receiver/ReceiverBankDetailsScreen';
import ReceiverEditProfileScreen from '../screens/receiver/ReceiverEditProfileScreen';
import ReceiverSelectGenderScreen from '../screens/receiver/ReceiverSelectGenderScreen';
import ReceiverCreateProfileScreen from '../screens/receiver/ReceiverCreateProfileScreen';
import ReceiverAutoVerificationScreen from '../screens/receiver/ReceiverAutoVerificationScreen';
import ReceiverProfilePreviewScreen from '../screens/receiver/ReceiverProfilePreviewScreen';
import ReceiverDeleteAccountScreen from '../screens/receiver/ReceiverDeleteAccountScreen';
import ReceiverEarningsBreakdownScreen from '../screens/receiver/ReceiverEarningsBreakdownScreen';
import ReceiverEarningsAnalyticsScreen from '../screens/receiver/ReceiverEarningsAnalyticsScreen';
import type { ReceiverStackParamList } from './ReceiverStackParamList';

const Stack = createNativeStackNavigator<ReceiverStackParamList>();

type Props = {
  initialRouteName?: keyof ReceiverStackParamList;
};

export default function ReceiverAppNavigator({
  initialRouteName = 'ReceiverHome',
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(10, insets.bottom);
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { paddingBottom: bottomGap },
      }}
    >
      <Stack.Screen name="ReceiverHome" component={ReceiverHomeDashboard} />
      <Stack.Screen name="ReceiverSettings" component={ReceiverSettingsScreen} />
      <Stack.Screen name="ReceiverNotifications" component={ReceiverNotificationsScreen} />
      <Stack.Screen name="ReceiverBankDetails" component={ReceiverBankDetailsScreen} />
      <Stack.Screen name="ReceiverEditProfile" component={ReceiverEditProfileScreen} />
      <Stack.Screen name="ReceiverSelectGender" component={ReceiverSelectGenderScreen} />
      <Stack.Screen name="ReceiverCreateProfile" component={ReceiverCreateProfileScreen} />
      <Stack.Screen name="ReceiverAutoVerification" component={ReceiverAutoVerificationScreen} />
      <Stack.Screen name="ReceiverProfilePreview" component={ReceiverProfilePreviewScreen} />
      <Stack.Screen name="ReceiverDeleteAccount" component={ReceiverDeleteAccountScreen} />
      <Stack.Screen name="ReceiverEarningsBreakdown" component={ReceiverEarningsBreakdownScreen} />
      <Stack.Screen name="ReceiverEarningsAnalytics" component={ReceiverEarningsAnalyticsScreen} />
      <Stack.Screen name="WithdrawEarnings" component={WithdrawEarningsScreen} />
      <Stack.Screen name="ReceiverCallHistory" component={ReceiverCallHistoryScreen} />
      <Stack.Screen name="ReceiverChats" component={ReceiverChatsScreen} />
      <Stack.Screen name="ReceiverChat" component={ChatConversationScreen} />
      <Stack.Screen
        name="VoiceCall"
        component={VoiceCallScreen}
        options={{ contentStyle: { paddingBottom: 0 } }}
      />
      <Stack.Screen name="IncomingCall" component={IncomingCallScreen} options={{ contentStyle: { paddingBottom: 0 } }} />
    </Stack.Navigator>
  );
}
