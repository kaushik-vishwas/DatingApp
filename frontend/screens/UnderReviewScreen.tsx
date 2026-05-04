import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage, profileApi } from '../services/api';

export default function UnderReviewScreen(): React.JSX.Element {
  const { user, signOut, refreshUser } = useAuth();

  const isCaller = user?.role === 'caller';
  const isPendingReview = user?.accountStatus === 'pending_review';
  const isRejected = user?.accountStatus === 'rejected';
  const suspended = Boolean(user?.suspended);
  const [resubmitting, setResubmitting] = React.useState(false);

  const onEditAndResubmit = async () => {
    setResubmitting(true);
    try {
      await profileApi.reopenRejectedReceiverKyc();
      await refreshUser();
    } catch (e) {
      Alert.alert('Unable to continue', getErrorMessage(e));
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <View style={styles.bg}>
      <View style={styles.card}>
        <Text style={styles.icon}>⏳</Text>
        {isCaller ? (
          <>
            <Text style={styles.title}>
              {isRejected ? 'Profile not approved' : isPendingReview ? 'Your profile is under review' : 'Access paused'}
            </Text>
            <Text style={styles.body}>
              {isRejected
                ? 'Your verification was not approved. Please contact support or update your profile and try again.'
                : isPendingReview
                  ? 'Thanks for submitting your profile. Our team will review it shortly. You will get dashboard access once approved.'
                  : 'Your account access is turned off until an admin enables it.'}
            </Text>
            <Text style={styles.muted}>Status: {user?.accountStatus ?? 'unknown'}</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>
              {isRejected ? 'Profile not approved' : 'Your profile is under review'}
            </Text>
            <Text style={styles.body}>
              {isRejected
                ? user?.rejectionReason?.trim() || 'Your application was not approved. Please edit and resubmit.'
                : 'Thanks for submitting your profile. Our team will review it shortly. You will get access to the dashboard once approved.'}
            </Text>
            <Text style={styles.muted}>Status: {user?.accountStatus ?? 'unknown'}</Text>
          </>
        )}
        {isCaller || !isRejected ? null : (
          <Button
            title={resubmitting ? 'Opening profile…' : 'Edit & Resubmit'}
            onPress={() => void onEditAndResubmit()}
            disabled={resubmitting}
          />
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
