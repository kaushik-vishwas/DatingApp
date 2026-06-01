import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { CallSignalProvider } from './context/CallSignalContext';
import { ChatInboxProvider } from './context/ChatInboxContext';
import AppNavigator from './navigation/AppNavigator';
import { ensureIncomingCallNotificationInfrastructure } from './utils/incomingCallNotifications';

export default function App() {
  useEffect(() => {
    return ensureIncomingCallNotificationInfrastructure();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ChatInboxProvider>
          <CallSignalProvider>
            <StatusBar style="dark" />
            <AppNavigator />
          </CallSignalProvider>
        </ChatInboxProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

