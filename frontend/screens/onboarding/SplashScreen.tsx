import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RootStackParamList } from '../../navigation/RootStackParamList';
import { markAuthWelcomeSeen } from '../../services/authWelcomeStorage';
import Logo from '../../assets/logo.png';
import LogoText from '../../assets/logoText.png';

const GREEN = '#1b4d3e';
const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props): React.JSX.Element {
  const onGetStarted = () => {
    void (async () => {
      await markAuthWelcomeSeen();
      navigation.replace('MobileLogin');
    })();
  };

  return (
    <View style={styles.root}>
      {/* Just the logo without circle ring */}
      <Image 
        source={Logo} 
        style={styles.logoImage}
        resizeMode="contain"
      />

      {/* Logo text image instead of "Selecto !" text */}
      <Image 
        source={LogoText} 
        style={styles.logoTextImage}
        resizeMode="contain"
      />

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
  logoImage: {
    width: 120,
    height: 120,
    marginBottom: 16,
  },
  logoTextImage: {
    width: 180,
    height: 50,
    marginBottom: 12,
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