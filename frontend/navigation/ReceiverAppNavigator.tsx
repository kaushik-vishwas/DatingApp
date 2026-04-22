import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import ReceiverHomeDashboard from '../screens/ReceiverHomeDashboard';
import ReceiverChatsScreen from '../screens/receiver/ReceiverChatsScreen';
import ChatConversationScreen from '../screens/chat/ChatConversationScreen';
import type { ReceiverStackParamList } from './ReceiverStackParamList';

const Stack = createNativeStackNavigator<ReceiverStackParamList>();

export default function ReceiverAppNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="ReceiverHome"
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="ReceiverHome" component={ReceiverHomeDashboard} />
      <Stack.Screen name="ReceiverChats" component={ReceiverChatsScreen} />
      <Stack.Screen name="ReceiverChat" component={ChatConversationScreen} />
    </Stack.Navigator>
  );
}
