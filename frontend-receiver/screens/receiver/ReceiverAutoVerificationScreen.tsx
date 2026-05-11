import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';

import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { profileApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverAutoVerification'>;

export default function ReceiverAutoVerificationScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { refreshUser } = useAuth();

  const [recording, setRecording] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [buttonEnabled, setButtonEnabled] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const wave3 = useRef(new Animated.Value(0)).current;

  const dots = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(dots, {
        toValue: 3,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    ).start();
  }, [dots]);

  const startWaves = () => {
    const createWave = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    };

    createWave(wave1, 0).start();
    createWave(wave2, 600).start();
    createWave(wave3, 1200).start();
  };

  const completeAudioVerification = async () => {
    setIsCompleting(true);
    try {
      // Just update userAudio with a dummy value using existing API
      await profileApi.updateReceiverProfile({
        userAudio: 'audio_verified_' + Date.now(),
      });
      await refreshUser();
      navigation.replace('ReceiverHome');
    } catch (error) {
      Alert.alert('Error', 'Failed to complete verification');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleFakeRecording = () => {
    if (recording || success) return;

    setRecording(true);
    startWaves();

    setTimeout(() => {
      setRecording(false);
      setAnalyzing(true);
    }, 3500);

    setTimeout(() => {
      setAnalyzing(false);
      setSuccess(true);
      setButtonEnabled(true);
    }, 6500);
  };

  const animatedDots = dots.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [0, 1, 2, 3],
  });

  const getDotsText = () => {
    const value = Math.floor(animatedDots as any);
    switch(value) {
      case 0: return '';
      case 1: return '.';
      case 2: return '..';
      case 3: return '...';
      default: return '';
    }
  };

  const renderWave = (anim: Animated.Value, size: number) => ({
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 2.2],
        }),
      },
    ],
    opacity: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 0],
    }),
    width: size,
    height: size,
    borderRadius: size / 2,
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={24} color="#111827" />
        </TouchableOpacity>

        <View style={styles.line} />

        <Text style={styles.title}>Audio Verification</Text>
        <Text style={styles.subTitle}>Record your audio by saying these lines</Text>

        <View style={styles.scriptWrap}>
          <Text style={styles.scriptText}>
            Hello! Friendship is very special because good friends are always by our side;
            they increase our happiness, decrease our sadness, and without them,
            everything feels incomplete—so, thank you, friends!
          </Text>
        </View>

        <View style={styles.micArea}>
          <Animated.View style={[styles.wave, renderWave(wave1, 90)]} />
          <Animated.View style={[styles.wave, renderWave(wave2, 110)]} />
          <Animated.View style={[styles.wave, renderWave(wave3, 130)]} />

          <TouchableOpacity activeOpacity={0.9} onPress={handleFakeRecording}>
            <LinearGradient
              colors={['#7F00FF', '#A855F7', '#E100FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.micBtn}
            >
              <Icon name="mic" size={34} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          {!recording && !analyzing && !success ? (
            <Text style={styles.micLabel}>Tap to Record</Text>
          ) : null}

          {recording ? (
            <Text style={styles.statusText}>Capturing your audio...</Text>
          ) : null}

          {analyzing ? (
            <Text style={styles.statusText}>
              Analyzing your audio{getDotsText()}
            </Text>
          ) : null}

          {success ? (
            <View style={styles.successWrap}>
              <Icon name="check-circle" size={20} color="#16a34a" />
              <Text style={styles.successText}>Voice verified successfully</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          disabled={!buttonEnabled || isCompleting}
          activeOpacity={0.9}
          onPress={completeAudioVerification}
          style={{ width: '100%' }}
        >
          <LinearGradient
            colors={
              buttonEnabled && !isCompleting
                ? ['#7F00FF', '#A855F7', '#E100FF']
                : ['#d8d8dd', '#d8d8dd']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.proceedBtn}
          >
            <Text
              style={[
                styles.proceedText,
                (!buttonEnabled || isCompleting) && { color: '#777' },
              ]}
            >
              {isCompleting ? 'Completing...' : 'Proceed'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },

  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 10,
    alignItems: 'flex-start',
  },

  backBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },

  line: {
    width: '100%',
    height: 1,
    backgroundColor: '#ececec',
    marginTop: 12,
    marginBottom: 28,
  },

  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },

  subTitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 6,
  },

  scriptWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  scriptText: {
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 34,
    color: '#374151',
    fontWeight: '500',
  },

  micArea: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 70,
    minHeight: 180,
  },

  wave: {
    position: 'absolute',
    backgroundColor: '#c084fc',
  },

  micBtn: {
    width: 86,
    height: 86,
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#9333ea',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },

  micLabel: {
    marginTop: 16,
    fontSize: 15,
    color: '#374151',
    fontWeight: '700',
  },

  statusText: {
    marginTop: 18,
    fontSize: 14,
    color: '#7F00FF',
    fontWeight: '700',
  },

  successWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },

  successText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#16a34a',
    fontWeight: '700',
  },

  proceedBtn: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 20,
  },

  proceedText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
});