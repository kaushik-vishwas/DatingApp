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

import { authApi, getErrorMessage, saveJwt } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/RootStackParamList';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

function maskPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length < 4) return d;
  return `******${d.slice(-4)}`;
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
      const { data } = await authApi.verifyOtp(phone, otp.trim(), accountType);
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
      Alert.alert('OTP sent', 'Check your mobile for the verification code.');
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
            { paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 14) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.bg}>
            <View style={styles.card}>
              {navigation.canGoBack() ? (
                <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
                  <Text style={styles.back}>←</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={styles.title}>Verify OTP</Text>
              <View style={styles.underline} />

              <Text style={styles.hint}>Enter the code sent to your mobile</Text>
              <Text style={styles.toWhere}>{maskPhoneDigits(phone)}</Text>

              <View style={styles.otpRow}>
                {Array.from({ length: 6 }).map((_, idx) => {
                  const digit = otp[idx] ?? '';
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={styles.otpBox}
                      onPress={() => inputRef.current?.focus()}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.otpDigit}>{digit}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                ref={inputRef}
                style={styles.input}
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
                autoFocus={false}
              />

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleVerify}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>{loading ? 'Verifying…' : 'Verify OTP'}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleResend} disabled={resendLoading}>
                  <Text style={styles.resend}>{resendLoading ? 'Sending…' : 'Resend code'}</Text>
                </TouchableOpacity>
              </View>
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
    padding: 22,
    borderRadius: 0,
  },
  backRow: {
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  back: {
    fontSize: 22,
    color: '#111',
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111',
  },
  underline: {
    height: 3,
    backgroundColor: '#7b2cff',
    width: 68,
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
    marginBottom: 18,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 6,
    marginBottom: 14,
  },
  otpBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 6,
    marginBottom: 10,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 6,
    color: '#111',
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  buttonContainer: {
    marginTop: 12,
  },
  button: {
    backgroundColor: '#7b2cff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  resend: {
    textAlign: 'center',
    color: '#7b2cff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 16,
  },
});