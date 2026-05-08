import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi, getErrorMessage, saveJwt } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import { isValidEmail, normalizeEmail, validatePasswordStrength } from '../utils/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation, route }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { accountType } = route.params;
  const { signIn } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    const e = normalizeEmail(email);
    if (!e || !isValidEmail(e)) {
      Alert.alert('Validation', 'Enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.forgotPassword(e, accountType);
      setEmail(e);
      setStep(2);
      if (data.emailSent === false) {
        Alert.alert('Forgot password', data.message);
      } else {
        Alert.alert('Check your email', 'Enter the 6-digit code and your new password.');
      }
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const e = normalizeEmail(email);
    const code = otp.trim();
    if (!e || code.length !== 6 || !/^\d+$/.test(code)) {
      Alert.alert('Validation', 'Enter the 6-digit code from your email');
      return;
    }
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) {
      Alert.alert('Validation', pwErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.resetPassword(e, code, newPassword, accountType);
      if (!data?.token) {
        Alert.alert('Error', 'No token returned from server');
        return;
      }
      await saveJwt(data.token);
      signIn(data.token, data.user);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.card}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(insets.top, 14) + 12, paddingBottom: Math.max(insets.bottom, 14) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>{'← Back'}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            {step === 1
              ? 'We will email you a code to reset your password.'
              : `Code sent to ${normalizeEmail(email) ?? ''}`}
          </Text>

          {step === 1 ? (
            <>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={() => void handleSendCode()}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Sending…' : 'Send code'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>6-digit code</Text>
              <TextInput
                style={styles.input}
                placeholder="000000"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
              />
              <Text style={styles.label}>New password</Text>
              <TextInput
                style={styles.input}
                placeholder="At least 8 characters"
                placeholderTextColor="#999"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <Text style={styles.label}>Confirm new password</Text>
              <TextInput
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor="#999"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={() => void handleReset()}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Updating…' : 'Update password'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resend}
                onPress={() => {
                  setStep(1);
                  setOtp('');
                }}
              >
                <Text style={styles.resendText}>Use a different email</Text>
              </TouchableOpacity>
            </>
          )}
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
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 0,
    flex: 1,
  },
  content: {
    padding: 22,
    paddingBottom: 32,
  },
  back: {
    color: PURPLE,
    fontWeight: '700',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginTop: 10,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: PURPLE,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14,
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
    fontSize: 12,
    fontWeight: '700',
  },
});
