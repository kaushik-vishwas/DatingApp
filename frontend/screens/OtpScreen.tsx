import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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
  const { email, accountType } = route.params;
  const { signIn } = useAuth();
  const [otp, setOtp] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [resendLoading, setResendLoading] = useState<boolean>(false);

  const validateOtp = (): string | null => {
    const code = otp.trim();
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
      const { data } = await authApi.verifyOtp(email, otp.trim(), accountType);
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
    if (!email) return;
    setResendLoading(true);
    try {
      await authApi.sendOtp(email, accountType);
      Alert.alert('OTP sent', 'Check your inbox for the verification code.');
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <View style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.card}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {navigation.canGoBack() ? (
          <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.title}>Verify OTP</Text>
        <View style={styles.underline} />

        <Text style={styles.hint}>Enter the code sent to your email</Text>
        <Text style={styles.toWhere}>{maskEmail(email)}</Text>

        <View style={styles.otpRow}>
          {Array.from({ length: 6 }).map((_, idx) => {
            const digit = otp[idx] ?? '';
            return (
              <View key={idx} style={styles.otpBox}>
                <Text style={styles.otpDigit}>{digit}</Text>
              </View>
            );
          })}
        </View>

        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={setOtp}
        />

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
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    padding: 22,
    borderRadius: 10,
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
  },
  button: {
    backgroundColor: '#7b2cff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
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
