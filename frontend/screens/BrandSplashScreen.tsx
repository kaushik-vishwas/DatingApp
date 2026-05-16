import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { RootStackParamList } from '../navigation/RootStackParamList';

type Props = NativeStackScreenProps<RootStackParamList, 'BrandSplash'>;

const { width, height } = Dimensions.get('window');

export default function BrandSplashScreen({ navigation, route }: Props): React.JSX.Element {
  const postSplashRoute = route.params?.postSplashRoute ?? 'MobileLogin';
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1.2)).current;
  const slideUpAnim = useRef(new Animated.Value(50)).current;
  const logoScaleAnim = useRef(new Animated.Value(0.3)).current;
  const logoOpacityAnim = useRef(new Animated.Value(0)).current;
  const titleSlideAnim = useRef(new Animated.Value(30)).current;
  const titleOpacityAnim = useRef(new Animated.Value(0)).current;
  const taglineSlideAnim = useRef(new Animated.Value(20)).current;
  const taglineOpacityAnim = useRef(new Animated.Value(0)).current;
  const glowPulseAnim = useRef(new Animated.Value(0)).current;
  const borderPulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    
    // Logo entrance: scale up with bounce
    Animated.parallel([
      Animated.spring(logoScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacityAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Title entrance after logo
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(titleSlideAnim, {
          toValue: 0,
          friction: 6,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacityAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 200);

    // Tagline entrance
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(taglineSlideAnim, {
          toValue: 0,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(taglineOpacityAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 400);

    // Glow pulse animation (continuous)
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowPulseAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Border pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(borderPulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(borderPulseAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Background fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Main container slide up
    Animated.spring(slideUpAnim, {
      toValue: 0,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();

    // Navigate after animations complete
    const timeout = setTimeout(() => {
      if (!cancelled) {
        navigation.replace(postSplashRoute, undefined);
      }
    }, 3200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  // Interpolations
  const glowIntensity = glowPulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.8, 0.3],
  });

  const borderWidth = borderPulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 3, 1],
  });

  const borderOpacity = borderPulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.8, 0.3],
  });

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={['#4A0E8B', '#7B2CFF', '#9B4DFF', '#C455FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          locations={[0, 0.3, 0.7, 1]}
        />
      </Animated.View>

      {/* Animated border rings around logo */}
      <Animated.View
        style={[
          styles.ring1,
          {
            opacity: borderOpacity,
            transform: [{ scale: borderPulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.2],
            }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring2,
          {
            opacity: borderOpacity,
            transform: [{ scale: borderPulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.4],
            }) }],
          },
        ]}
      />

      {/* Floating Particles */}
      <View style={styles.particlesContainer}>
        {[...Array(15)].map((_, i) => {
          const particleAnim = useRef(new Animated.Value(0)).current;
          
          useEffect(() => {
            Animated.loop(
              Animated.timing(particleAnim, {
                toValue: 1,
                duration: 2500 + Math.random() * 2000,
                easing: Easing.linear,
                useNativeDriver: true,
              })
            ).start();
          }, []);

          const particleY = particleAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [height, -50],
          });

          const particleOpacity = particleAnim.interpolate({
            inputRange: [0, 0.3, 0.7, 1],
            outputRange: [0, 0.5, 0.5, 0],
          });

          return (
            <Animated.View
              key={i}
              style={[
                styles.particle,
                {
                  left: `${Math.random() * 100}%`,
                  width: 2 + Math.random() * 4,
                  height: 2 + Math.random() * 4,
                  opacity: particleOpacity,
                  transform: [{ translateY: particleY }],
                  backgroundColor: `rgba(255, 255, 255, ${0.4 + Math.random() * 0.4})`,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Main Content */}
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ translateY: slideUpAnim }],
          },
        ]}
      >
        {/* Logo with Glow Effect */}
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              transform: [{ scale: logoScaleAnim }],
              opacity: logoOpacityAnim,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.logoGlow,
              {
                opacity: glowIntensity,
              },
            ]}
          />
          <View style={styles.logoBorder}>
            <Image
              source={require('../assets/SelectoLogo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        {/* App Name with Stagger Animation */}
        <Animated.View
          style={[
            styles.titleWrapper,
            {
              transform: [{ translateY: titleSlideAnim }],
              opacity: titleOpacityAnim,
            },
          ]}
        >
          <Text style={styles.appName}>
            Selecto
          </Text>
          <Animated.View
            style={[
              styles.underline,
              {
                width: borderPulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 80],
                }),
              },
            ]}
          />
        </Animated.View>

        {/* Tagline */}
        <Animated.Text
          style={[
            styles.tagline,
            {
              transform: [{ translateY: taglineSlideAnim }],
              opacity: taglineOpacityAnim,
            },
          ]}
        >
          Premium Dating Experience
        </Animated.Text>
      </Animated.View>

      {/* Bottom Loading Indicator */}
      <Animated.View style={[styles.loadingContainer, { opacity: fadeAnim }]}>
        <View style={styles.loadingBar}>
          <Animated.View
            style={[
              styles.loadingProgress,
              {
                width: glowPulseAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: ['10%', '80%', '10%'],
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.loadingText}>Preparing your experience...</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A0E8B',
  },
  particlesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    borderRadius: 10,
  },
  ring1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  ring2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  logoWrapper: {
    width: 130,
    height: 130,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  logoGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#C455FF',
    shadowColor: '#C455FF',
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 10,
  },
  logoBorder: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  titleWrapper: {
    alignItems: 'center',
    marginTop: 8,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  underline: {
    height: 2,
    backgroundColor: '#C455FF',
    marginTop: 8,
    borderRadius: 1,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginTop: 16,
    letterSpacing: 0.5,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
    zIndex: 1,
    width: width * 0.7,
  },
  loadingBar: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  loadingProgress: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  loadingText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
});