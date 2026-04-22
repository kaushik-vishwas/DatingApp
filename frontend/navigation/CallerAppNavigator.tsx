import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import CallerDiscoverHome from '../screens/CallerDiscoverHome';
import CallerAlertsTabScreen from '../screens/caller/CallerAlertsTabScreen';
import CallerCallsTabScreen from '../screens/caller/CallerCallsTabScreen';
import CallerChatsScreen from '../screens/caller/CallerChatsScreen';
import CallerEditProfileScreen from '../screens/caller/CallerEditProfileScreen';
import CallerHelpScreen from '../screens/caller/CallerHelpScreen';
import CallerPrivacyPolicyScreen from '../screens/caller/CallerPrivacyPolicyScreen';
import CallerProfileTabScreen from '../screens/caller/CallerProfileTabScreen';
import CallerTermsScreen from '../screens/caller/CallerTermsScreen';
import PaymentMethodScreen from '../screens/caller/PaymentMethodScreen';
import ReceiverProfileScreen from '../screens/caller/ReceiverProfileScreen';
import ChatConversationScreen from '../screens/chat/ChatConversationScreen';
import VoiceCallScreen from '../screens/call/VoiceCallScreen';
import WalletScreen from '../screens/caller/WalletScreen';
import WalletSuccessScreen from '../screens/caller/WalletSuccessScreen';
import type { CallerStackParamList } from './CallerStackParamList';

const Stack = createNativeStackNavigator<CallerStackParamList>();

export default function CallerAppNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="CallerDiscover"
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="CallerDiscover" component={CallerDiscoverHome} />
      <Stack.Screen name="CallerCalls" component={CallerCallsTabScreen} />
      <Stack.Screen name="CallerAlerts" component={CallerAlertsTabScreen} />
      <Stack.Screen name="CallerProfile" component={CallerProfileTabScreen} />
      <Stack.Screen name="CallerEditProfile" component={CallerEditProfileScreen} />
      <Stack.Screen name="CallerTerms" component={CallerTermsScreen} />
      <Stack.Screen name="CallerPrivacyPolicy" component={CallerPrivacyPolicyScreen} />
      <Stack.Screen name="CallerHelp" component={CallerHelpScreen} />
      <Stack.Screen name="CallerChats" component={CallerChatsScreen} />
      <Stack.Screen name="CallerChat" component={ChatConversationScreen} />
      <Stack.Screen name="VoiceCall" component={VoiceCallScreen} />
      <Stack.Screen name="ReceiverProfile" component={ReceiverProfileScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
      <Stack.Screen name="PaymentMethod" component={PaymentMethodScreen} />
      <Stack.Screen
        name="WalletSuccess"
        component={WalletSuccessScreen}
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
    </Stack.Navigator>
  );
}
