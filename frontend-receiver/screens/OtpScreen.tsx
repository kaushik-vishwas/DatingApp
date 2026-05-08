import React, { useState, useRef, useEffect } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi, getErrorMessage, saveJwt } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/RootStackParamList';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

function maskEmail(email: string): string {
  const e = email.trim();
  const at = e.indexOf('@');
  if (at <= 1) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export default function OtpScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { email, accountType } = route.params;
  const { signIn } = useAuth();
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState<boolean>(false);
  const [resendLoading, setResendLoading] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [canResend, setCanResend] = useState<boolean>(false);
  
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (timeLeft > 0 && !canResend) {
      timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else if (timeLeft === 0 && !canResend) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [timeLeft, canResend]);

  const handleOtpChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);

    // Auto-focus next input
    if (text.length === 1 && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    // Handle backspace
    if (e.nativeEvent.key === 'Backspace' && index > 0 && !otp[index]) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const validateOtp = (): string | null => {
    const code = otp.join('');
    if (code.length !== 6 || !/^\d+$/.test(code)) {
      return 'Enter the 6-digit code from your email';
    }
    return null;
  };

  const handleVerify = async () => {
    if (!email) {
      Alert.alert('Error', 'Missing email. Go back and try again.');
      return;
    }
    const err = validateOtp();
    if (err) {
      Alert.alert('Validation', err);
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(email, otp.join(''), accountType);
      if (!data?.token) {
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

  const handleResend = async () => {
    if (!email || !canResend) return;
    setResendLoading(true);
    try {
      await authApi.sendOtp(email, accountType);
      Alert.alert('OTP sent', 'Check your inbox for the verification code.');
      setTimeLeft(30);
      setCanResend(false);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setResendLoading(false);
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  // Auto-focus first input on mount
  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={dismissKeyboard}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            { paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 14) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.bg}>
            <View style={styles.card}>
              {/* Back Button */}
              {navigation.canGoBack() && (
                <TouchableOpacity 
                  style={styles.backButton} 
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backIcon}>←</Text>
                </TouchableOpacity>
              )}

              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Verify OTP</Text>
                <View style={styles.underline} />
              </View>

              {/* Instructions */}
              <View style={styles.instructionContainer}>
                <Text style={styles.hint}>Enter the verification code</Text>
                <Text style={styles.subHint}>sent to your email</Text>
                <View style={styles.emailContainer}>
                  <Text style={styles.emailLabel}>📧</Text>
                  <Text style={styles.email}>{maskEmail(email)}</Text>
                </View>
              </View>

              {/* OTP Input Fields */}
              <View style={styles.otpContainer}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    style={[
                      styles.otpInput,
                      digit && styles.otpInputFilled,
                    ]}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(text) => handleOtpChange(text, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    selectTextOnFocus
                    contextMenuHidden
                  />
                ))}
              </View>

              {/* Verify Button */}
              <TouchableOpacity
                style={[
                  styles.verifyButton,
                  (loading || otp.join('').length !== 6) && styles.verifyButtonDisabled,
                ]}
                onPress={handleVerify}
                disabled={loading || otp.join('').length !== 6}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.verifyButtonText}>Verify & Continue</Text>
                )}
              </TouchableOpacity>

              {/* Resend Section */}
              <View style={styles.resendContainer}>
                <Text style={styles.resendText}>Didn't receive the code?</Text>
                {canResend ? (
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={resendLoading}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.resendLink}>
                      {resendLoading ? 'Sending...' : 'Resend Code'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.timerContainer}>
                    <Text style={styles.timerText}>Resend available in </Text>
                    <Text style={styles.timerCount}>{timeLeft}s</Text>
                  </View>
                )}
              </View>

              {/* Help Text */}
              <Text style={styles.helpText}>
                Check your spam folder if you don't see the email
              </Text>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#262626',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  bg: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 0,
  },
  card: {
    width: '100%',
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 0,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: '#111',
    fontWeight: '600',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
  },
  underline: {
    height: 3,
    backgroundColor: '#7b2cff',
    width: 50,
    marginTop: 8,
    borderRadius: 2,
  },
  instructionContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  hint: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  subHint: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  emailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  emailLabel: {
    fontSize: 14,
    marginRight: 8,
  },
  email: {
    fontSize: 13,
    color: '#7b2cff',
    fontWeight: '600',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 8,
  },
  otpInput: {
    flex: 1,
    height: 56,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    backgroundColor: '#fff',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    paddingHorizontal: 0,
  },
  otpInputFilled: {
    borderColor: '#7b2cff',
    backgroundColor: '#f8f3ff',
  },
  verifyButton: {
    backgroundColor: '#7b2cff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#7b2cff',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  resendText: {
    fontSize: 13,
    color: '#666',
    marginRight: 6,
  },
  resendLink: {
    fontSize: 13,
    color: '#7b2cff',
    fontWeight: '700',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerText: {
    fontSize: 13,
    color: '#666',
  },
  timerCount: {
    fontSize: 13,
    color: '#7b2cff',
    fontWeight: '700',
  },
  helpText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#999',
    marginTop: 8,
  },
});

// If you don't have react-native-linear-gradient installed, remove the import and use this alternative:
// Just use a regular View instead of LinearGradient, or install: npm install react-native-linear-gradient