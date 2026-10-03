import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useMainTabsScreenOptions } from '../utils/receiverTabBarInset';

import ReceiverHomeDashboard from '../screens/ReceiverHomeDashboard';
import ReceiverPaymentTabScreen from '../screens/receiver/tabs/ReceiverPaymentTabScreen';
import ReceiverHistoryTabScreen from '../screens/receiver/tabs/ReceiverHistoryTabScreen';
import ReceiverChatTabScreen from '../screens/receiver/tabs/ReceiverChatTabScreen';
import type { ReceiverTabParamList } from './ReceiverTabParamList';
import { withBottomTabSwipe } from './MainTabSwipeLayout';

const Tab = createBottomTabNavigator<ReceiverTabParamList>();

const SwipeReceiverHome = withBottomTabSwipe(ReceiverHomeDashboard);
const SwipeReceiverPayment = withBottomTabSwipe(ReceiverPaymentTabScreen);
const SwipeReceiverHistory = withBottomTabSwipe(ReceiverHistoryTabScreen);
const SwipeReceiverChat = withBottomTabSwipe(ReceiverChatTabScreen);

const TAB_PURPLE = '#7b2cff';
const TAB_INACTIVE = '#9ca3af';

export default function ReceiverMainTabsNavigator(): React.JSX.Element {
  const mainTabOptions = useMainTabsScreenOptions('receiver');
  return (
    <Tab.Navigator
      initialRouteName="ReceiverHome"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_PURPLE,
        tabBarInactiveTintColor: TAB_INACTIVE,
        ...mainTabOptions,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="ReceiverHome"
        component={SwipeReceiverHome}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="ReceiverPayment"
        component={SwipeReceiverPayment}
        options={{
          tabBarLabel: 'Payment',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="ReceiverHistory"
        component={SwipeReceiverHistory}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="ReceiverChat"
        component={SwipeReceiverChat}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
