import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ReceiverChatsScreen from '../screens/receiver/ReceiverChatsScreen';
import { ReceiverNotificationDataProvider } from '../context/ReceiverNotificationDataContext';
import ReceiverMainTabsNavigator from './ReceiverMainTabsNavigator';
import ChatConversationScreen from '../screens/chat/ChatConversationScreen';
import IncomingCallScreen from '../screens/call/IncomingCallScreen';
import VoiceCallScreen from '../screens/call/VoiceCallScreen';
import WithdrawEarningsScreen from '../screens/receiver/WithdrawEarningsScreen';
import ReceiverCallHistoryScreen from '../screens/receiver/ReceiverCallHistoryScreen';
import ReceiverSettingsScreen from '../screens/receiver/ReceiverSettingsScreen';
import ReceiverHowToEarnScreen from '../screens/receiver/ReceiverHowToEarnScreen';
import ReceiverGuidelinesScreen from '../screens/receiver/ReceiverGuidelinesScreen';
import ReceiverNotificationsScreen from '../screens/receiver/ReceiverNotificationsScreen';
import ReceiverBankDetailsScreen from '../screens/receiver/ReceiverBankDetailsScreen';
import ReceiverEditProfileScreen from '../screens/receiver/ReceiverEditProfileScreen';
import ReceiverSelectGenderScreen from '../screens/receiver/ReceiverSelectGenderScreen';
import ReceiverCreateProfileScreen from '../screens/receiver/ReceiverCreateProfileScreen';
import ReceiverOnboardingFlow from './ReceiverOnboardingFlow';
import ReceiverAutoVerificationScreen from '../screens/receiver/ReceiverAutoVerificationScreen';
import ReceiverProfilePreviewScreen from '../screens/receiver/ReceiverProfilePreviewScreen';
import ReceiverDeleteAccountScreen from '../screens/receiver/ReceiverDeleteAccountScreen';
import ReceiverEarningsBreakdownScreen from '../screens/receiver/ReceiverEarningsBreakdownScreen';
import ReceiverEarningsAnalyticsScreen from '../screens/receiver/ReceiverEarningsAnalyticsScreen';
import ReceiverAvailabilityWaitingScreen from '../screens/receiver/ReceiverAvailabilityWaitingScreen';
import type { ReceiverStackParamList } from './ReceiverStackParamList';

const Stack = createNativeStackNavigator<ReceiverStackParamList>();

type Props = {
  initialRouteName?: keyof ReceiverStackParamList;
};

export default function ReceiverAppNavigator({
  initialRouteName = 'ReceiverMainTabs',
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(10, insets.bottom);
  return (
    <ReceiverNotificationDataProvider>
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { paddingBottom: bottomGap },
      }}
    >
      <Stack.Screen
        name="ReceiverMainTabs"
        component={ReceiverMainTabsNavigator}
        options={{ contentStyle: { paddingBottom: 0 } }}
      />
      <Stack.Screen
        name="ReceiverAvailabilityWaiting"
        component={ReceiverAvailabilityWaitingScreen}
        options={{ animation: 'fade', gestureEnabled: false, contentStyle: { paddingBottom: 0 } }}
      />
      <Stack.Screen name="ReceiverSettings" component={ReceiverSettingsScreen} />
      <Stack.Screen name="ReceiverGuidelines" component={ReceiverGuidelinesScreen} />
      <Stack.Screen name="ReceiverHowToEarn" component={ReceiverHowToEarnScreen} />
      <Stack.Screen name="ReceiverNotifications" component={ReceiverNotificationsScreen} />
      <Stack.Screen name="ReceiverBankDetails" component={ReceiverBankDetailsScreen} />
      <Stack.Screen name="ReceiverEditProfile" component={ReceiverEditProfileScreen} />
      <Stack.Screen name="ReceiverSelectGender" component={ReceiverSelectGenderScreen} />
      <Stack.Screen name="ReceiverOnboarding">
        {({ route }) => <ReceiverOnboardingFlow initialGender={route.params?.gender ?? null} />}
      </Stack.Screen>
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
        options={{ contentStyle: { paddingBottom: 0 }, gestureEnabled: false }}
      />
      <Stack.Screen
        name="IncomingCall"
        component={IncomingCallScreen}
        options={{ contentStyle: { paddingBottom: 0 } }}
      />
    </Stack.Navigator>
    </ReceiverNotificationDataProvider>
  );
}
