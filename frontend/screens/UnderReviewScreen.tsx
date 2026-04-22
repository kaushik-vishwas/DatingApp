import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

export default function UnderReviewScreen(): React.JSX.Element {
  const { user, signOut } = useAuth();

  const isCaller = user?.role === 'caller';
  const isRejected = user?.accountStatus === 'rejected';
  const suspended = Boolean(user?.suspended);

  return (
    <View style={styles.bg}>
      <View style={styles.card}>
        <Text style={styles.icon}>⏳</Text>
        {isCaller ? (
          <>
            <Text style={styles.title}>Access paused</Text>
            <Text style={styles.body}>
              Your account access is turned off until an admin enables it. If you just submitted your profile, please
              wait for a team member to review it.
            </Text>
            <Text style={styles.muted}>Suspended: {suspended ? 'yes' : 'no'}</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>
              {isRejected ? 'Profile not approved' : 'Your profile is under review'}
            </Text>
            <Text style={styles.body}>
              {isRejected
                ? 'Your application was not approved. Contact support for more information.'
                : 'Thanks for submitting your profile. Our team will review it shortly. You will get access to the dashboard once approved.'}
            </Text>
            <Text style={styles.muted}>Status: {user?.accountStatus ?? 'unknown'}</Text>
          </>
        )}
        <Button title="Log out" variant="outline" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#262626',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  muted: {
    fontSize: 12,
    color: '#888',
    marginBottom: 20,
  },
});
