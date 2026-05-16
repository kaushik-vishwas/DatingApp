import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/RootStackParamList';
import { authApi, getErrorMessage, saveJwt } from '../../services/api';
import type { AuthAccountType } from '../../types/api';
import { normalizeIndianMobileDigits, validateIndianMobileDigits } from '../../utils/validation';

export type AuthLoginCardProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  mobile: string;
  onMobileChange: (value: string) => void;
  logoLetter?: string;
  title: string;
  subtitle: string;
  primaryRegisterLabel: string;
  onPrimaryRegister: () => void;
  secondaryRegisterLabel?: string;
  onSecondaryRegister?: () => void;
  switchLoginLabel?: string;
  onSwitchLogin?: () => void;
  onChooseAccountType?: () => void;
  authAccountType: AuthAccountType;
  customLogo?: React.ReactNode;
};

type LoginStep = 'mobile' | 'otp';

export function AuthLoginCard({
  navigation,
  mobile,
  onMobileChange,
  logoLetter,
  title,
  subtitle,
  primaryRegisterLabel,
  onPrimaryRegister,
  secondaryRegisterLabel,
  onSecondaryRegister,
  switchLoginLabel,
  onSwitchLogin,
  onChooseAccountType,
  authAccountType,
  customLogo,
}: AuthLoginCardProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const showSecondaryRegister = Boolean(secondaryRegisterLabel && onSecondaryRegister);
  const showSwitchLogin = Boolean(switchLoginLabel && onSwitchLogin);
  const { signIn } = useAuth();
  const [step, setStep] = useState<LoginStep>('mobile');
  const [otp, setOtp] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const scrollToFocusedInput = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const responder = TextInput.State.currentlyFocusedInput?.();
        if (!responder || !scrollRef.current) return;
        scrollRef.current.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(responder, 120, true);
      }, 30);
    });
  }, []);

  const digits = normalizeIndianMobileDigits(mobile);

  const onSendOtp = async () => {
    const err = validateIndianMobileDigits(digits);
    if (err) {
      Alert.alert('Validation', err);
      return;
    }
    try {
      await authApi.sendOtp(digits, authAccountType);
      setOtp('');
      setStep('otp');
    } catch (e) {
      Alert.alert('No account found', 'No account found');
    }
  };

  const onVerifyOtpAndLogin = async () => {
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Validation', 'Enter a valid 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(digits, code, authAccountType);
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
            {customLogo ? (
              <View style={styles.logoContainer}>{customLogo}</View>
            ) : logoLetter ? (
              <View style={styles.logoCircle}>
                <Text style={styles.logoLetter}>{logoLetter}</Text>
              </View>
            ) : null}
            
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <Text style={styles.label}>Mobile number</Text>
            <TextInput
              style={styles.input}
              placeholder="10-digit mobile"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              editable={step === 'mobile'}
              value={mobile}
              onChangeText={onMobileChange}
              onFocus={scrollToFocusedInput}
            />

            {step === 'otp' ? (
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
                <TouchableOpacity onPress={() => setStep('mobile')} style={styles.changeNumber}>
                  <Text style={styles.changeNumberText}>Change number</Text>
                </TouchableOpacity>
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.buttonWrapper, loading && styles.buttonDisabled]}
              onPress={() => void (step === 'mobile' ? onSendOtp() : onVerifyOtpAndLogin())}
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
                  {loading ? 'Signing in…' : step === 'mobile' ? 'Send OTP' : 'Log in'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.footer} onPress={onPrimaryRegister}>
              <Text style={styles.footerText}>{primaryRegisterLabel}</Text>
            </TouchableOpacity>

            {showSecondaryRegister ? (
              <TouchableOpacity style={styles.footerSecondary} onPress={onSecondaryRegister}>
                <Text style={styles.footerSecondaryText}>{secondaryRegisterLabel}</Text>
              </TouchableOpacity>
            ) : null}

            {showSwitchLogin ? (
              <>
                <View style={styles.switchDivider} />
                <TouchableOpacity style={styles.switchLogin} onPress={onSwitchLogin}>
                  <Text style={styles.switchLoginText}>{switchLoginLabel}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {onChooseAccountType ? (
              <TouchableOpacity style={styles.chooseRole} onPress={onChooseAccountType}>
                <Text style={styles.chooseRoleText}>Choose account type</Text>
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
    backgroundColor: '#fff',
    padding: 22,
    borderRadius: 0,
  },
  logoContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logoLetter: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  subtitle: {
    color: '#666',
    fontSize: 12,
    marginBottom: 18,
    lineHeight: 16,
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
  footer: {
    paddingTop: 14,
    paddingBottom: 6,
    alignItems: 'center',
  },
  footerText: {
    color: PURPLE,
    fontSize: 12,
    fontWeight: '700',
  },
  footerSecondary: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  footerSecondaryText: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
  },
  switchDivider: {
    height: 1,
    backgroundColor: '#ececec',
    marginTop: 14,
    marginBottom: 12,
  },
  switchLogin: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  switchLoginText: {
    color: PURPLE,
    fontSize: 13,
    fontWeight: '700',
  },
  chooseRole: {
    marginTop: 14,
    alignItems: 'center',
    paddingBottom: 2,
  },
  chooseRoleText: {
    color: '#777',
    fontSize: 12,
    fontWeight: '600',
  },
});