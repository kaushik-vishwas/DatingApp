import React from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

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

  const reviewTitle = isRejected
    ? 'Profile not approved'
    : isPendingReview
      ? 'Verification in Progress'
      : 'Access paused';
  const reviewBody = isCaller
    ? isRejected
      ? 'Your verification was not approved. Please contact support or update your profile and try again.'
      : isPendingReview
        ? 'Your application is being reviewed by our team. This usually takes 24-48 hours.'
        : 'Your account access is turned off until an admin enables it.'
    : isRejected
      ? user?.rejectionReason?.trim() || 'Your application was not approved. Please edit and resubmit.'
      : 'Your application is being reviewed by our team. This usually takes 24-48 hours.';

  React.useEffect(() => {
    if (!user) return;
    // Keep session state fresh while waiting for admin decision so users are moved
    // to dashboard immediately after approval without manual logout/login.
    if (user.accountStatus !== 'pending_review') return;
    void refreshUser();
    const poll = setInterval(() => {
      void refreshUser();
    }, 5000);
    return () => clearInterval(poll);
  }, [user, refreshUser]);

  return (
    <View style={styles.bg}>
      <View style={styles.card}>
        {/* Application Status - top most */}
        <Text style={styles.pageTitle}>Application Status</Text>
        
        {/* Status badge showing pending_review */}
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>pending_review</Text>
        </View>

        <View style={styles.divider} />

        {/* Bigger pending icon - centered in yellowish peripheral */}
        <View style={styles.iconOuterRing}>
          <View style={styles.iconInnerCircle}>
            <Text style={[styles.icon, isPendingReview ? styles.iconPending : null]}>
              {isRejected ? '✕' : '◷'}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>{reviewTitle}</Text>
        <Text style={styles.body}>{reviewBody}</Text>

        <View style={styles.helpBox}>
          <Text style={styles.helpText}>
            If you have any questions, please contact our support team at
            <Text style={styles.helpEmail}> receiver-support@lap.com</Text>
          </Text>
        </View>

        {isCaller || !isRejected ? null : (
  <View style={{ minWidth: 200 }}>
    <Button
      title={resubmitting ? 'Opening profile…' : 'Edit & Resubmit'}
      onPress={() => void onEditAndResubmit()}
      disabled={resubmitting}
    />
  </View>
)}
        
        {/* Logout button without full width */}
        <View style={styles.logoutButtonWrapper}>
          <Button 
            title="Log out" 
            variant="outline" 
            onPress={() => void signOut()}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#f4f4f5',
    padding: 0,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 0,
    padding: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 10,
    ...Platform.select({
      ios: {
        fontWeight: '800',
      },
      android: {
        fontWeight: 'bold',
      },
    }),
  },
  statusBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b45309',
    textTransform: 'capitalize',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#efefef',
    marginBottom: 24,
  },
  // Yellowish peripheral ring with centered icon
  iconOuterRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fff5d6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#c78a02',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  iconInnerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff5d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 40,
    color: '#c78a02',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    ...Platform.select({
      ios: {
        marginTop: 0,
      },
      android: {
        textAlignVertical: 'center',
        includeFontPadding: false,
        lineHeight: undefined,
      },
    }),
  },
  iconPending: {
    fontSize: 54,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
    marginBottom: 10,
    ...Platform.select({
      ios: {
        fontWeight: '900',
      },
      android: {
        fontWeight: 'bold',
      },
    }),
  },
  body: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    maxWidth: 300,
  },
  helpBox: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    backgroundColor: '#fafafa',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  helpText: {
    fontSize: 11,
    color: '#777',
    textAlign: 'center',
    lineHeight: 16,
  },
  helpEmail: {
    color: '#7b2cff',
    fontWeight: '700',
  },
  logoutButtonWrapper: {
    marginTop: 12,
    alignSelf: 'center',
    minWidth: 120
  },
});