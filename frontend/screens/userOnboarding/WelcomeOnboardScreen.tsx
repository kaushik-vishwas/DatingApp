import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<UserOnboardingStackParamList, 'WelcomeOnboard'>;

export default function WelcomeOnboardScreen({ route }: Props): React.JSX.Element {
  const { displayName } = route.params;
  const { refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const first = displayName.trim().split(/\s+/)[0] || displayName;
  const greetingName = first.endsWith('!') ? first : `${first}!`;

  const onGetStarted = async () => {
    setBusy(true);
    try {
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.art}>
        <View style={styles.scooterCard}>
          <Text style={styles.artEmoji} accessibilityLabel="Welcome illustration">
            🛵
          </Text>
          <Text style={styles.artEmojiSmall}>💑</Text>
        </View>
      </View>

      <Text style={styles.title}>Welcome Onboard!</Text>
      <View style={styles.nameLine}>
        <Text style={styles.namePurple}>{greetingName}</Text>
      </View>
      <Text style={styles.sub}>You are all set to explore Nesthama.</Text>

      <TouchableOpacity
        style={[styles.cta, busy && styles.ctaDisabled]}
        onPress={() => void onGetStarted()}
        disabled={busy}
        activeOpacity={0.9}
      >
        <Text style={styles.ctaText}>{busy ? 'Loading…' : 'Get Started!'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingTop: 56,
    paddingBottom: 32,
    alignItems: 'center',
  },
  art: {
    marginBottom: 28,
  },
  scooterCard: {
    width: 200,
    height: 160,
    borderRadius: 20,
    backgroundColor: '#fff9db',
    borderWidth: 1,
    borderColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  artEmoji: {
    fontSize: 72,
  },
  artEmojiSmall: {
    fontSize: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 12,
  },
  nameLine: {
    marginBottom: 10,
    alignItems: 'center',
  },
  namePurple: {
    fontSize: 28,
    fontWeight: '800',
    color: PURPLE,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  cta: {
    marginTop: 'auto',
    width: '100%',
    maxWidth: 400,
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.65,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
