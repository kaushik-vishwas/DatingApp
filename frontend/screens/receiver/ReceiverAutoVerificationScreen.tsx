import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';

import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverAutoVerification'>;

// Language translations for the script
const SCRIPT_TRANSLATIONS = {
  english: "Hello! Friendship is very special because good friends are always by our side; they increase our happiness, decrease our sadness, and without them, everything feels incomplete—so, thank you, friends!",
  telugu: "నమస్కారం! స్నేహం చాలా ప్రత్యేకమైనది ఎందుకంటే మంచి స్నేహితులు ఎప్పుడూ మా పక్కన ఉంటారు; వారు మా ఆనందాన్ని పెంచుతారు, మా విచారాన్ని తగ్గిస్తారు, మరియు వారు లేకుండా, ప్రతిదీ అసంపూర్ణంగా అనిపిస్తుంది—కాబట్టి, ధన్యవాదాలు స్నేహితులారా!",
  kannada: "ನಮಸ್ಕಾರ! ಸ್ನೇಹವು ಬಹಳ ವಿಶೇಷವಾಗಿದೆ ಏಕೆಂದರೆ ಉತ್ತಮ ಸ್ನೇಹಿತರು ಯಾವಾಗಲೂ ನಮ್ಮ ಪಕ್ಕದಲ್ಲಿರುತ್ತಾರೆ; ಅವರು ನಮ್ಮ ಸಂತೋಷವನ್ನು ಹೆಚ್ಚಿಸುತ್ತಾರೆ, ನಮ್ಮ ದುಃಖವನ್ನು ಕಡಿಮೆ ಮಾಡುತ್ತಾರೆ, ಮತ್ತು ಅವರಿಲ್ಲದೆ, ಎಲ್ಲವೂ ಅಪೂರ್ಣವಾಗಿ ಭಾಸವಾಗುತ್ತದೆ—ಆದ್ದರಿಂದ, ಧನ್ಯವಾದಗಳು ಸ್ನೇಹಿತರೇ!"
};

type Language = 'english' | 'telugu' | 'kannada';

export default function ReceiverAutoVerificationScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { applyServerUser } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('english');
  
  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0)).current;
  const waveAnim2 = useRef(new Animated.Value(0)).current;
  const waveAnim3 = useRef(new Animated.Value(0)).current;
  
  // Animation control
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  
  const verificationTimeout = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (verificationTimeout.current) {
        clearTimeout(verificationTimeout.current);
      }
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, []);

  const startRecordingAnimation = () => {
    // Stop any existing animation
    if (animationRef.current) {
      animationRef.current.stop();
    }
    
    // Reset all animation values
    pulseAnim.setValue(1);
    waveAnim1.setValue(0);
    waveAnim2.setValue(0);
    waveAnim3.setValue(0);
    
    // Create pulse animation
    const pulseAnimation = Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.2,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]);
    
    // Create wave animations
    const wave1Animation = Animated.sequence([
      Animated.timing(waveAnim1, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(waveAnim1, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]);
    
    const wave2Animation = Animated.sequence([
      Animated.delay(300),
      Animated.timing(waveAnim2, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(waveAnim2, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]);
    
    const wave3Animation = Animated.sequence([
      Animated.delay(600),
      Animated.timing(waveAnim3, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(waveAnim3, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]);
    
    // Loop all animations in parallel
    animationRef.current = Animated.loop(
      Animated.parallel([
        pulseAnimation,
        wave1Animation,
        wave2Animation,
        wave3Animation,
      ])
    );
    
    animationRef.current.start();
  };

  const stopRecordingAnimation = () => {
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
    
    // Reset all animation values
    pulseAnim.setValue(1);
    waveAnim1.setValue(0);
    waveAnim2.setValue(0);
    waveAnim3.setValue(0);
  };

  const handleMicPress = () => {
    if (isVerified || isVerifying) {
      return;
    }
    
    if (!isRecording) {
      // Start recording
      setIsRecording(true);
      startRecordingAnimation();
    } else {
      // Stop recording
      setIsRecording(false);
      stopRecordingAnimation();
      
      // Start verification
      setIsVerifying(true);
      
      // Clear existing timeout
      if (verificationTimeout.current) {
        clearTimeout(verificationTimeout.current);
      }
      
      // Simulate verification
      verificationTimeout.current = setTimeout(() => {
        setIsVerifying(false);
        setIsVerified(true);
        if (verificationTimeout.current) {
          clearTimeout(verificationTimeout.current);
        }
      }, 3000);
    }
  };

  const onProceed = async (): Promise<void> => {
    if (!isVerified) {
      Alert.alert('Verification Required', 'Please record and verify your voice first.');
      return;
    }
    
    try {
      const { data } = await profileApi.completeReceiverAudioOnboarding();
      applyServerUser(data.user);
      navigation.replace('ReceiverMainTabs', { screen: 'ReceiverHome' });
    } catch (e) {
      Alert.alert('Could not continue', getErrorMessage(e));
    }
  };

  // Get current script text based on selected language
  const currentScriptText = SCRIPT_TRANSLATIONS[selectedLanguage];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={24} color="#111827" />
        </TouchableOpacity>

        <View style={styles.line} />

        <Text style={styles.title}>Audio verification</Text>
        <Text style={styles.subTitle}>
          {isVerified 
            ? '✓ Voice verified successfully!' 
            : 'Record your voice by reading the paragraph below'}
        </Text>

        {/* Language Tabs */}
        <View style={styles.languageTabsContainer}>
          <TouchableOpacity
            style={[
              styles.languageTab,
              selectedLanguage === 'english' && styles.languageTabActive,
            ]}
            onPress={() => setSelectedLanguage('english')}
          >
            <Text
              style={[
                styles.languageTabText,
                selectedLanguage === 'english' && styles.languageTabTextActive,
              ]}
            >
              English
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.languageTab,
              selectedLanguage === 'telugu' && styles.languageTabActive,
            ]}
            onPress={() => setSelectedLanguage('telugu')}
          >
            <Text
              style={[
                styles.languageTabText,
                selectedLanguage === 'telugu' && styles.languageTabTextActive,
              ]}
            >
              తెలుగు
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.languageTab,
              selectedLanguage === 'kannada' && styles.languageTabActive,
            ]}
            onPress={() => setSelectedLanguage('kannada')}
          >
            <Text
              style={[
                styles.languageTabText,
                selectedLanguage === 'kannada' && styles.languageTabTextActive,
              ]}
            >
              ಕನ್ನಡ
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Script Card */}
          <View style={styles.scriptCard}>
            <Text style={styles.scriptText}>{currentScriptText}</Text>
          </View>

          {/* Verification Animation */}
          {isVerifying && (
            <View style={styles.verificationContainer}>
              <ActivityIndicator size="large" color="#7F00FF" />
              <Text style={styles.verifyingText}>Analyzing your voice...</Text>
              <Text style={styles.verifyingSubText}>Please wait while we verify</Text>
            </View>
          )}

          {/* Verified Badge */}
          {isVerified && (
            <View style={styles.verifiedContainer}>
              <View style={styles.verifiedIcon}>
                <Icon name="check" size={50} color="#fff" />
              </View>
              <Text style={styles.verifiedText}>Voice Verified!</Text>
              <Text style={styles.verifiedSubText}>Your voice has been successfully verified</Text>
            </View>
          )}

          {/* Single Mic Button with Waves - Toggles between Start and Stop */}
          {!isVerifying && !isVerified && (
            <View style={styles.micContainer}>
              {/* Wave animations - positioned behind the mic button */}
              {isRecording && (
                <>
                  <Animated.View
                    style={[
                      styles.wave,
                      {
                        transform: [
                          {
                            scale: waveAnim1.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.5],
                            }),
                          },
                        ],
                        opacity: waveAnim1.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 0],
                        }),
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.wave,
                      {
                        transform: [
                          {
                            scale: waveAnim2.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.8],
                            }),
                          },
                        ],
                        opacity: waveAnim2.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 0],
                        }),
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.wave,
                      {
                        transform: [
                          {
                            scale: waveAnim3.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 2.1],
                            }),
                          },
                        ],
                        opacity: waveAnim3.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.4, 0],
                        }),
                      },
                    ]}
                  />
                </>
              )}
              
              {/* Main Mic Button */}
              <TouchableOpacity
                onPress={handleMicPress}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={isRecording ? ['#EF4444', '#DC2626'] : ['#7F00FF', '#A855F7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.micGradient}
                >
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <Icon name="mic" size={50} color="#fff" />
                  </Animated.View>
                </LinearGradient>
              </TouchableOpacity>
              
              <Text style={styles.micButtonText}>
                {isRecording ? 'Tap to Stop Recording' : 'Tap to Start Recording'}
              </Text>
            </View>
          )}
        </ScrollView>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onProceed}
          style={[styles.proceedWrap, !isVerified && styles.proceedDisabled]}
          disabled={!isVerified}
        >
          <LinearGradient
            colors={isVerified ? ['#7F00FF', '#A855F7', '#E100FF'] : ['#D1D5DB', '#9CA3AF', '#D1D5DB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.proceedBtn}
          >
            <Text style={styles.proceedText}>Continue to dashboard</Text>
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
    marginBottom: 20,
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
    marginBottom: 12,
    lineHeight: 18,
  },
  languageTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginTop: 8,
    marginBottom: 16,
  },
  languageTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  languageTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  languageTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  languageTabTextActive: {
    color: '#7F00FF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
    alignItems: 'center',
  },
  scriptCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
  },
  scriptText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
    textAlign: 'center',
  },
  micContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    position: 'relative',
    width: '100%',
    minHeight: 200,
  },
  wave: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: '#A855F7',
    backgroundColor: 'transparent',
    left: '50%',
    top: '50%',
    marginLeft: -70,
    marginTop: -70,
  },
  micGradient: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  micButtonText: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  verificationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F3E8FF',
    borderRadius: 16,
    marginBottom: 24,
    width: '100%',
  },
  verifyingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#7F00FF',
    marginTop: 12,
  },
  verifyingSubText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  verifiedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    marginBottom: 24,
    width: '100%',
  },
  verifiedIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  verifiedText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 4,
  },
  verifiedSubText: {
    fontSize: 14,
    color: '#047857',
  },
  proceedWrap: {
    width: '100%',
    marginBottom: 20,
  },
  proceedDisabled: {
    opacity: 0.6,
  },
  proceedBtn: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  proceedText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
});