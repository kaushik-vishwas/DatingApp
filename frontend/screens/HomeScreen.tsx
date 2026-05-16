import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import ReceiverHomeDashboard from './ReceiverHomeDashboard';

/** Post-login home for receivers (callers use `CallerApp` stack). */
export default function HomeScreen(): React.JSX.Element {
  const { user } = useAuth();

  if (!user) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <ReceiverHomeDashboard />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
