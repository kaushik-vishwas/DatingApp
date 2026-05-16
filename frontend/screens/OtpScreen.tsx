import React, { useState, useRef } from 'react';
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
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';

import { authApi, getErrorMessage, saveJwt } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/RootStackParamList';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

function getFullMobileNumber(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length === 0) return 'your mobile';
  return d;
}

export default function OtpScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { phone, accountType } = route.params;
  const { signIn } = useAuth();

  const [otp, setOtp] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [resendLoading, setResendLoading] = useState<boolean>(false);

  const inputRef = useRef<TextInput>(null);

  const validateOtp = (): string | null => {
    const code = otp.trim();

    if (code.length !== 6 || !/^\d+$/.test(code)) {
      return 'Enter the 6-digit code sent to your mobile';
    }

    return null;
  };

  const handleVerify = async () => {
    const err = validateOtp();

    if (err) {
      Alert.alert('Validation', err);
      return;
    }

    setLoading(true);

    try {
      const { data } = await authApi.verifyOtp(
        phone,
        otp.trim(),
        accountType,
      );

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
    if (!phone) return;

    setResendLoading(true);

    try {
      await authApi.sendOtp(phone, accountType);

      Alert.alert(
        'OTP sent',
        'Check your mobile for the verification code.',
      );
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setResendLoading(false);
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

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
            {
              paddingTop: Math.max(insets.top, 20),
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.contentContainer}>
            {/* Back Button */}
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
            >
              <Icon name="chevron-back" size={26} color="#7b2cff" />
            </TouchableOpacity>

            {/* Title */}
            <Text style={styles.title}>Verify OTP</Text>

            <View style={styles.underline} />

            {/* Subtitle */}
            <Text style={styles.hint}>
              Enter the code sent to your mobile
            </Text>

            <Text style={styles.toWhere}>
              {getFullMobileNumber(phone)}
            </Text>

            {/* OTP BOXES */}
            <View style={styles.otpRow}>
              {Array.from({ length: 6 }).map((_, idx) => {
                const digit = otp[idx] ?? '';

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.otpBox,
                      digit && styles.otpBoxFilled,
                    ]}
                    onPress={() => inputRef.current?.focus()}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.otpDigit}>{digit}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Hidden Input */}
            <TextInput
              ref={inputRef}
              style={styles.input}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              autoFocus
            />

            {/* Verify Button */}
            <TouchableOpacity
              style={[
                styles.buttonWrapper,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleVerify}
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
                  {loading ? 'Verifying…' : 'Verify OTP'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Resend */}
            <TouchableOpacity
              onPress={handleResend}
              disabled={resendLoading}
            >
              <Text style={styles.resend}>
                {resendLoading ? 'Sending…' : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },

  contentContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },

  backBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
  },

  underline: {
    height: 3,
    backgroundColor: '#7b2cff',
    width: 70,
    marginTop: 10,
    borderRadius: 2,
  },

  hint: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 14,
    fontWeight: '700',
    color: '#444',
  },

  toWhere: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    marginBottom: 24,
  },

  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
    gap: 8,
  },

  otpBox: {
    width: 48,
    height: 58,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  otpBoxFilled: {
    borderColor: '#7b2cff',
    backgroundColor: '#f8f3ff',
  },

  otpDigit: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111',
  },

  input: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },

  buttonWrapper: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  button: {
    paddingVertical: 15,
    alignItems: 'center',
  },

  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  resend: {
    textAlign: 'center',
    color: '#7b2cff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 18,
  },
});