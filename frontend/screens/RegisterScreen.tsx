import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { authApi, getErrorMessage } from '../services/api';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import DobPickerField from '../components/DobPickerField';
import { ageFromLocalCalendarBirthDate, formatDateOnlyLocal, maxDobDateForMinAge } from '../utils/birthDateClient';
import { isValidEmail, normalizeEmail, validateIndianMobileDigits, validatePasswordStrength } from '../utils/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({ navigation, route }: Props) {
  const [fullName, setFullName] = useState<string>('');
  const [dob, setDob] = useState<Date | null>(null);
  const [emailAddress, setEmailAddress] = useState<string>(route.params?.email ?? '');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [agreeTerms, setAgreeTerms] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const scrollToFocusedInput = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const responder = TextInput.State.currentlyFocusedInput?.();
        if (!responder || !scrollRef.current) return;
        // @ts-expect-error: RN types don't expose `scrollResponderScrollNativeHandleToKeyboard` on ref
        scrollRef.current.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(responder, 120, true);
      }, 30);
    });
  }, []);

  const validate = (): string | null => {
    const name = fullName.trim();
    if (name.length < 2) return 'Enter your full name (at least 2 characters)';

    if (!dob) return 'Select your date of birth';
    const age = ageFromLocalCalendarBirthDate(dob);
    if (age < 18 || age > 120) return 'You must be between 18 and 120 years old';

    const email = normalizeEmail(emailAddress);
    if (!email) return 'Email is required';
    if (!isValidEmail(email)) return 'Enter a valid email address';

    const digits = phone.replace(/\D/g, '');
    const phoneErr = validateIndianMobileDigits(digits);
    if (phoneErr) return phoneErr;

    const pwErr = validatePasswordStrength(password);
    if (pwErr) return pwErr;
    if (password !== confirmPassword) return 'Passwords do not match';

    if (!agreeTerms) return 'Please agree to the Terms & Conditions';

    return null;
  };

  const handleRegister = async () => {
    const err = validate();
    if (err) {
      Alert.alert('Validation', err);
      return;
    }
    if (!dob) return;

    const name = fullName.trim();
    const email = normalizeEmail(emailAddress);
    const phoneDigits = phone.replace(/\D/g, '');

    setLoading(true);
    try {
      await authApi.register({
        name,
        email,
        phone: phoneDigits,
        password,
        dateOfBirth: formatDateOnlyLocal(dob),
        role: 'receiver',
      });

      await authApi.sendOtp(email, 'receiver');
      navigation.navigate('Otp', { email, accountType: 'receiver' });
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.card}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
          }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>{'← Back'}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Sign up as a Receiver</Text>
          <Text style={styles.subtitle}>Fill in details to start receiving calls</Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#999"
            value={fullName}
            onChangeText={setFullName}
            onFocus={scrollToFocusedInput}
          />

          <DobPickerField
            label="Date of Birth *"
            value={dob}
            onChange={setDob}
            fallbackDate={maxDobDateForMinAge(25)}
          />

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            value={emailAddress}
            onChangeText={setEmailAddress}
            onFocus={scrollToFocusedInput}
          />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="10-digit mobile"
            placeholderTextColor="#999"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            onFocus={scrollToFocusedInput}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 8 characters, letter + number"
            placeholderTextColor="#999"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            onFocus={scrollToFocusedInput}
          />

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter password"
            placeholderTextColor="#999"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={scrollToFocusedInput}
          />

          <TouchableOpacity style={styles.termsRow} onPress={() => setAgreeTerms((v) => !v)}>
            <View style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}>
              {agreeTerms ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.termsText}>I agree to the Terms & Conditions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => void handleRegister()}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Creating…' : 'Create account'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('ReceiverLogin', undefined)}>
            <Text style={styles.linkText}>Already have an account? Log in</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkAlt} onPress={() => navigation.navigate('UserRegister', undefined)}>
            <Text style={styles.linkAltText}>Joining as an app user instead?</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const PURPLE = '#7b2cff';

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
    borderRadius: 10,
  },
  content: {
    padding: 22,
    paddingTop: 12,
    paddingBottom: 180,
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  termsText: {
    color: '#444',
    fontSize: 12,
    flex: 1,
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
  link: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: PURPLE,
    fontSize: 12,
    fontWeight: '700',
  },
  linkAlt: {
    marginTop: 12,
    alignItems: 'center',
  },
  linkAltText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
});
