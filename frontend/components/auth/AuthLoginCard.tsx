import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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

import { useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/RootStackParamList';
import { authApi, getErrorMessage, saveJwt } from '../../services/api';
import type { AuthAccountType } from '../../types/api';
import { isValidEmail, normalizeEmail, validatePasswordStrength } from '../../utils/validation';

export type AuthLoginCardProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  email: string;
  onEmailChange: (value: string) => void;
  logoLetter: string;
  title: string;
  subtitle: string;
  primaryRegisterLabel: string;
  onPrimaryRegister: () => void;
  secondaryRegisterLabel?: string;
  onSecondaryRegister?: () => void;
  switchLoginLabel: string;
  onSwitchLogin: () => void;
  /** Return to role picker (splash path) without signing in */
  onChooseAccountType?: () => void;
  /** Backend auth table: `users` vs `receivers` */
  authAccountType: AuthAccountType;
};

export function AuthLoginCard({
  navigation,
  email,
  onEmailChange,
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
}: AuthLoginCardProps): React.JSX.Element {
  const showSecondaryRegister = Boolean(secondaryRegisterLabel && onSecondaryRegister);
  const { signIn } = useAuth();
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const validate = (): string | null => {
    const e = normalizeEmail(email);
    if (!e) return 'Please enter your email';
    if (!isValidEmail(e)) return 'Enter a valid email address';
    const pwErr = validatePasswordStrength(password);
    if (pwErr) return pwErr;
    return null;
  };

  const handleLogin = async () => {
    const err = validate();
    if (err) {
      Alert.alert('Validation', err);
      return;
    }

    const e = normalizeEmail(email)!;
    setLoading(true);
    try {
      const { data } = await authApi.login(e, password, authAccountType);
      if (!data?.token) {
        Alert.alert('Error', 'No token returned from server');
        return;
      }
      await saveJwt(data.token);
      signIn(data.token, data.user);
    } catch (err) {
      Alert.alert('Could not sign in', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.card}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.logoCircle}>
          <Text style={styles.logoLetter}>{logoLetter}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={onEmailChange}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#999"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword', { accountType: authAccountType })}>
          <Text style={styles.forgot}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => void handleLogin()}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Log in'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.footer} onPress={onPrimaryRegister}>
          <Text style={styles.footerText}>{primaryRegisterLabel}</Text>
        </TouchableOpacity>

        {showSecondaryRegister ? (
          <TouchableOpacity style={styles.footerSecondary} onPress={onSecondaryRegister}>
            <Text style={styles.footerSecondaryText}>{secondaryRegisterLabel}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.switchDivider} />
        <TouchableOpacity style={styles.switchLogin} onPress={onSwitchLogin}>
          <Text style={styles.switchLoginText}>{switchLoginLabel}</Text>
        </TouchableOpacity>

        {onChooseAccountType ? (
          <TouchableOpacity style={styles.chooseRole} onPress={onChooseAccountType}>
            <Text style={styles.chooseRoleText}>Choose account type</Text>
          </TouchableOpacity>
        ) : null}
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
    padding: 22,
    borderRadius: 10,
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
  forgot: {
    color: PURPLE,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 14,
  },
  button: {
    backgroundColor: PURPLE,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
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
