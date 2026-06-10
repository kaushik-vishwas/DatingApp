import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CallerChatsScreen from '../screens/caller/CallerChatsScreen';
import CallerEditProfileScreen from '../screens/caller/CallerEditProfileScreen';
import CallerFaqScreen from '../screens/caller/CallerFaqScreen';
import CallerShareAppScreen from '../screens/caller/CallerShareAppScreen';
import CallerHelpScreen from '../screens/caller/CallerHelpScreen';
import CallerPrivacyPolicyScreen from '../screens/caller/CallerPrivacyPolicyScreen';
import CallerProfileTabScreen from '../screens/caller/CallerProfileTabScreen';
import CallerRateUsScreen from '../screens/caller/CallerRateUsScreen';
import CallerTermsScreen from '../screens/caller/CallerTermsScreen';
import PaymentMethodScreen from '../screens/caller/PaymentMethodScreen';
import ReceiverProfileScreen from '../screens/caller/ReceiverProfileScreen';
import ChatConversationScreen from '../screens/chat/ChatConversationScreen';
import VoiceCallScreen from '../screens/call/VoiceCallScreen';
import CallDiagnosticsScreen from '../screens/call/CallDiagnosticsScreen';
import PresenceDiagnosticsScreen from '../screens/call/PresenceDiagnosticsScreen';
import WalletScreen from '../screens/caller/WalletScreen';
import WalletTransactionsScreen from '../screens/caller/WalletTransactionsScreen';
import WalletSuccessScreen from '../screens/caller/WalletSuccessScreen';
import { CallerMessageEligibilityProvider } from '../context/CallerMessageEligibilityContext';
import CallerMainTabsNavigator from './CallerMainTabsNavigator';
import type { CallerStackParamList } from './CallerStackParamList';

const Stack = createNativeStackNavigator<CallerStackParamList>();

export default function CallerAppNavigator(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(10, insets.bottom);
  return (
    <CallerMessageEligibilityProvider>
    <Stack.Navigator
      initialRouteName="CallerMainTabs"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { paddingBottom: bottomGap },
      }}
    >
      <Stack.Screen
        name="CallerMainTabs"
        component={CallerMainTabsNavigator}
        options={{ contentStyle: { paddingBottom: 0 } }}
      />
      <Stack.Screen name="CallerProfile" component={CallerProfileTabScreen} />
      <Stack.Screen name="CallerRateUs" component={CallerRateUsScreen} />
      <Stack.Screen name="CallerShareApp" component={CallerShareAppScreen} />
      <Stack.Screen name="CallerFaq" component={CallerFaqScreen} />
      <Stack.Screen name="CallerEditProfile" component={CallerEditProfileScreen} />
      <Stack.Screen name="CallerTerms" component={CallerTermsScreen} />
      <Stack.Screen name="CallerPrivacyPolicy" component={CallerPrivacyPolicyScreen} />
      <Stack.Screen name="CallerHelp" component={CallerHelpScreen} />
      <Stack.Screen name="CallerChats" component={CallerChatsScreen} />
      <Stack.Screen name="CallerChat" component={ChatConversationScreen} />
      <Stack.Screen
        name="VoiceCall"
        component={VoiceCallScreen}
        options={{ contentStyle: { paddingBottom: 0 }, gestureEnabled: false }}
      />
      <Stack.Screen
        name="CallDiagnostics"
        component={CallDiagnosticsScreen}
        options={{ title: 'Call diagnostics' }}
      />
      <Stack.Screen
        name="PresenceDiagnostics"
        component={PresenceDiagnosticsScreen}
        options={{ title: 'Presence diagnostics' }}
      />
      <Stack.Screen name="ReceiverProfile" component={ReceiverProfileScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
      <Stack.Screen name="WalletTransactions" component={WalletTransactionsScreen} />
      <Stack.Screen name="PaymentMethod" component={PaymentMethodScreen} />
      <Stack.Screen
        name="WalletSuccess"
        component={WalletSuccessScreen}
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
    </Stack.Navigator>
    </CallerMessageEligibilityProvider>
  );
}
