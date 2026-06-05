import * as NavigationBar from 'expo-navigation-bar';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { CallSignalProvider } from './context/CallSignalContext';
import { ChatInboxProvider } from './context/ChatInboxContext';
import IncomingCallNotifDebugOverlay from './components/debug/IncomingCallNotifDebugOverlay';
import AppNavigator from './navigation/AppNavigator';
import { ensureIncomingCallNotificationInfrastructure } from './utils/incomingCallNotifications';

export default function App() {
  useEffect(() => {
    return ensureIncomingCallNotificationInfrastructure();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void NavigationBar.setBackgroundColorAsync('#ffffff');
    void NavigationBar.setButtonStyleAsync('dark');
  }, []);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <AuthProvider>
          <ChatInboxProvider>
            <CallSignalProvider>
              <StatusBar style="dark" backgroundColor="#fff" translucent={false} />
              <AppNavigator />
              <IncomingCallNotifDebugOverlay />
            </CallSignalProvider>
          </ChatInboxProvider>
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}

