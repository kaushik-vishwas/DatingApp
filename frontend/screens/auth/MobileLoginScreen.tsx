import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/RootStackParamList';
import { authApi, getErrorMessage, saveJwt } from '../../services/api';
import { normalizeIndianMobileDigits, validateIndianMobileDigits } from '../../utils/validation';
import SelectoLogo from '../../assets/SelectoLogo.png';

type Props = NativeStackScreenProps<RootStackParamList, 'MobileLogin'>;

type Step = 'mobile' | 'otp';

export default function MobileLoginScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [mobile, setMobile] = useState('');
  const [step, setStep] = useState<Step>('mobile');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const digits = normalizeIndianMobileDigits(mobile);

  const scrollToFocusedInput = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const responder = TextInput.State.currentlyFocusedInput?.();
        if (!responder || !scrollRef.current) return;
        scrollRef.current.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(responder, 120, true);
      }, 30);
    });
  }, []);

  const onSendOtp = async () => {
    const err = validateIndianMobileDigits(digits);
    if (err) {
      Alert.alert('Validation', err);
      return;
    }
    setLoading(true);
    try {
      await authApi.sendMobileOtp(digits);
      setOtp('');
      setStep('otp');
    } catch (e) {
      Alert.alert('Could not send OTP', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Validation', 'Enter a valid 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.verifyMobileOtp(digits, code);
      if (data.status === 'needs_gender') {
        navigation.navigate('AuthGender', { phone: data.phone });
        return;
      }
      if (!data.token) {
        Alert.alert('Error', 'No token returned from server');
        return;
      }
      await saveJwt(data.token);
      signIn(data.token, data.user);
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.bg}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        enabled={Platform.OS === 'ios'}
      >
        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
          }}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 20),
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onScrollBeginDrag={Keyboard.dismiss}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <Image source={SelectoLogo} style={styles.logo} resizeMode="contain" />
            </View>

            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>
              {step === 'mobile'
                ? 'Enter your mobile number to continue'
                : `Enter the code sent to ${digits}`}
            </Text>

            {step === 'mobile' ? (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="10-digit mobile"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={mobile}
                  onChangeText={setMobile}
                  onFocus={scrollToFocusedInput}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>OTP</Text>
                <TextInput
                  style={styles.input}
                  placeholder="6-digit OTP"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={otp}
                  onChangeText={setOtp}
                  onFocus={scrollToFocusedInput}
                />
                <TouchableOpacity
                  onPress={() => {
                    setStep('mobile');
                    setOtp('');
                  }}
                  style={styles.changeNumber}
                >
                  <Text style={styles.changeNumberText}>Change number</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.buttonWrapper, loading && styles.buttonDisabled]}
              onPress={() => void (step === 'mobile' ? onSendOtp() : onVerifyOtp())}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#7F00FF', '#A855F7', '#E100FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Please wait…' : step === 'mobile' ? 'Send OTP' : 'Verify & continue'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {step === 'otp' ? (
              <TouchableOpacity
                style={styles.resend}
                onPress={() => void onSendOtp()}
                disabled={loading}
              >
                <Text style={styles.resendText}>Resend code</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const PURPLE = '#7b2cff';

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    padding: 22,
  },
  logoContainer: {
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  logo: {
    width: 150,
    height: 50,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  subtitle: {
    color: '#666',
    fontSize: 13,
    marginBottom: 18,
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  changeNumber: {
    marginTop: -6,
    marginBottom: 8,
  },
  changeNumberText: {
    color: PURPLE,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonWrapper: {
    marginTop: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  button: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  resend: {
    marginTop: 16,
    alignItems: 'center',
  },
  resendText: {
    color: PURPLE,
    fontSize: 13,
    fontWeight: '700',
  },
});
