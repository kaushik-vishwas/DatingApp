import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { CallSignalProvider } from './context/CallSignalContext';
import { ChatInboxProvider } from './context/ChatInboxContext';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
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

