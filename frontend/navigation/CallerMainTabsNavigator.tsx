import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useMainTabsScreenOptions } from '../utils/receiverTabBarInset';
import { useCallerAlertsTabBadge } from '../hooks/useCallerAlertsTabBadge';

import CallerDiscoverHome from '../screens/CallerDiscoverHome';
import CallerAlertsTabScreen from '../screens/caller/CallerAlertsTabScreen';
import CallerCallsTabScreen from '../screens/caller/CallerCallsTabScreen';
import CallerChatTabScreen from '../screens/caller/tabs/CallerChatTabScreen';
import type { CallerTabParamList } from './CallerTabParamList';
import { withBottomTabSwipe } from './MainTabSwipeLayout';

const Tab = createBottomTabNavigator<CallerTabParamList>();

const SwipeCallerHome = withBottomTabSwipe(CallerDiscoverHome);
const SwipeCallerRecents = withBottomTabSwipe(CallerCallsTabScreen);
const SwipeCallerAlerts = withBottomTabSwipe(CallerAlertsTabScreen);
const SwipeCallerChats = withBottomTabSwipe(CallerChatTabScreen);

const TAB_PURPLE = '#7b2cff';
const TAB_INACTIVE = '#9ca3af';

export default function CallerMainTabsNavigator(): React.JSX.Element {
  const { badge: alertsBadge, clearBadge: clearAlertsBadge } = useCallerAlertsTabBadge();
  const mainTabOptions = useMainTabsScreenOptions('caller');

  return (
    <Tab.Navigator
      initialRouteName="CallerHome"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_PURPLE,
        tabBarInactiveTintColor: TAB_INACTIVE,
        ...mainTabOptions,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="CallerHome"
        component={SwipeCallerHome}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="CallerRecents"
        component={SwipeCallerRecents}
        options={{
          tabBarLabel: 'Recents',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="CallerAlerts"
        component={SwipeCallerAlerts}
        listeners={{
          focus: () => clearAlertsBadge(),
        }}
        options={{
          tabBarLabel: 'Alerts',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
          tabBarBadge: alertsBadge,
        }}
      />
      <Tab.Screen
        name="CallerChatsTab"
        component={SwipeCallerChats}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
