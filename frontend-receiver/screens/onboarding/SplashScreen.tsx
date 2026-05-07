import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RootStackParamList } from '../../navigation/RootStackParamList';
import { markAuthWelcomeSeen } from '../../services/authWelcomeStorage';

const GREEN = '#1b4d3e';
const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props): React.JSX.Element {
  const onGetStarted = () => {
    void (async () => {
      await markAuthWelcomeSeen();
      navigation.replace('RoleGate');
    })();
  };

  return (
    <View style={styles.root}>
      <View style={styles.logoRing}>
        <Text style={styles.logoGlyph} accessibilityLabel="Selecto logo">
          🤝
        </Text>
      </View>

      <Text style={styles.brand}>Selecto !</Text>
      <Text style={styles.tagline}>A online Friendship app 👋</Text>

      <TouchableOpacity style={styles.cta} onPress={onGetStarted} activeOpacity={0.9}>
        <Text style={styles.ctaText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(27, 77, 62, 0.06)',
  },
  logoGlyph: {
    fontSize: 36,
  },
  brand: {
    fontSize: 32,
    fontWeight: '600',
    color: GREEN,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    marginBottom: 10,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  cta: {
    backgroundColor: PURPLE,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
