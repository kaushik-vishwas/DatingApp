import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi, getErrorMessage } from '../services/api';
import {
  isPhoneRegisteredForAccountType,
  savePendingOtpRegistration,
} from '../services/localMobileAuthStorage';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import { normalizeIndianMobileDigits, validateIndianMobileDigits } from '../utils/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'UserRegister'>;

export default function UserRegisterScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState<string>(route.params?.mobile ?? '');
  const [agreeTerms, setAgreeTerms] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    setPhone(route.params?.mobile ?? '');
  }, [route.params?.mobile]);

  const scrollToFocusedInput = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const responder = TextInput.State.currentlyFocusedInput?.();
        if (!responder || !scrollRef.current) return;
        scrollRef.current.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(responder, 120, true);
      }, 30);
    });
  }, []);

  const validate = (): string | null => {
    const digits = normalizeIndianMobileDigits(phone);
    const phoneErr = validateIndianMobileDigits(digits);
    if (phoneErr) return phoneErr;

    if (!agreeTerms) return 'Please agree to the Terms & Conditions';

    return null;
  };

  const handleRegister = async () => {
    const err = validate();
    if (err) {
      Alert.alert('Validation', err);
      return;
    }

    const phoneDigits = normalizeIndianMobileDigits(phone);

    const taken = await isPhoneRegisteredForAccountType(phoneDigits, 'user');
    if (taken) {
      Alert.alert('Mobile number already registered', 'Mobile number already registered');
      return;
    }

    setLoading(true);
    try {
      await authApi.register({
        phone: phoneDigits,
        role: 'caller',
      });

      await authApi.sendOtp(phoneDigits, 'user');
      navigation.navigate('Otp', { phone: phoneDigits, accountType: 'user' });
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
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(insets.top, 14) + 12, paddingBottom: Math.max(insets.bottom, 14) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>{'← Back'}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>We will send a code to verify your mobile number</Text>

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
            <Text style={styles.buttonText}>{loading ? 'Sending code…' : 'Continue'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('UserLogin', undefined)}>
            <Text style={styles.linkText}>Already have an account? Log in</Text>
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
});
