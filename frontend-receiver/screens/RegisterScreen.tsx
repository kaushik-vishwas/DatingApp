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
  Modal,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';

import { LinearGradient } from 'expo-linear-gradient';

import { authApi, getErrorMessage } from '../services/api';
import {
  isPhoneRegisteredForAccountType,
} from '../services/localMobileAuthStorage';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import DobPickerField from '../components/DobPickerField';
import { ageFromLocalCalendarBirthDate, formatDateOnlyLocal, maxDobDateForMinAge } from '../utils/birthDateClient';
import {
  normalizeIndianMobileDigits,
  validateIndianMobileDigits,
} from '../utils/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState<string>('');
  const [dob, setDob] = useState<Date | null>(null);
  const [phone, setPhone] = useState<string>(route.params?.phone ?? '');
  const [agreedToPolicies, setAgreedToPolicies] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (route.params?.phone) setPhone(route.params.phone);
  }, [route.params?.phone, route.params?.email]);

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
    const name = fullName.trim();
    if (name.length < 2) return 'Enter your full name (at least 2 characters)';

    if (!dob) return 'Select your date of birth';
    const age = ageFromLocalCalendarBirthDate(dob);
    if (age < 18 || age > 120) return 'You must be between 18 and 120 years old';

    const digits = normalizeIndianMobileDigits(phone);
    const phoneErr = validateIndianMobileDigits(digits);
    if (phoneErr) return phoneErr;

    if (!agreedToPolicies) return 'You must agree to the Terms & Conditions and Privacy Policy';

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
    const phoneDigits = normalizeIndianMobileDigits(phone);

    const taken = await isPhoneRegisteredForAccountType(phoneDigits, 'receiver');
    if (taken) {
      Alert.alert('Mobile number already registered', 'Mobile number already registered');
      return;
    }

    setLoading(true);
    try {
      await authApi.register({
        name,
        phone: phoneDigits,
        dateOfBirth: formatDateOnlyLocal(dob),
        role: 'receiver',
      });

      await authApi.sendOtp(phoneDigits, 'receiver');
      navigation.navigate('Otp', { phone: phoneDigits, accountType: 'receiver' });
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
          }}
          contentContainerStyle={[
            styles.content,
            { 
              paddingTop: Math.max(insets.top, 14) + 12, 
              paddingBottom: Math.max(insets.bottom, 14) + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onScrollBeginDrag={Keyboard.dismiss}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="chevron-left" size={24} color={PURPLE} />
          </TouchableOpacity>

          <View style={styles.centeredContent}>
            <Text style={styles.title}>Sign up as a Receiver</Text>
            <Text style={styles.subtitle}>Fill in details to start receiving calls</Text>

            <Text style={styles.label}>Full Name *</Text>
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

            <Text style={styles.label}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="10-digit mobile"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              onFocus={scrollToFocusedInput}
            />

            {/* Single Checkbox for both policies */}
            <TouchableOpacity style={styles.termsRow} onPress={() => setAgreedToPolicies((v) => !v)}>
              <View style={[styles.checkbox, agreedToPolicies && styles.checkboxChecked]}>
                {agreedToPolicies ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.linkText} onPress={() => setShowTermsModal(true)}>
                  Terms & Conditions
                </Text>
                {' and '}
                <Text style={styles.linkText} onPress={() => setShowPrivacyModal(true)}>
                  Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
  style={loading && styles.buttonDisabled}
  onPress={() => void handleRegister()}
  disabled={loading}
>
  <LinearGradient
    colors={['#7F00FF', '#A855F7', '#E100FF']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={styles.button}
  >
    <Text style={styles.buttonText}>
      {loading ? 'Creating…' : 'Create account'}
    </Text>
  </LinearGradient>
</TouchableOpacity>

            <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('ReceiverLogin', undefined)}>
              <Text style={styles.linkText}>Already have an account? Log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Terms & Conditions Modal */}
      <Modal
        visible={showTermsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Terms & Conditions</Text>
              <TouchableOpacity onPress={() => setShowTermsModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalContent}
            >
              <Text style={styles.modalSectionTitle}>1. Acceptance of Terms</Text>
              <Text style={styles.modalText}>
                By creating an account and using this application, you agree to be bound by these Terms & Conditions. If you do not agree to these terms, please do not use the app.
              </Text>

              <Text style={styles.modalSectionTitle}>2. Eligibility</Text>
              <Text style={styles.modalText}>
                You must be at least 18 years old to register and use this service. By registering, you confirm that you meet this age requirement.
              </Text>

              <Text style={styles.modalSectionTitle}>3. Account Responsibility</Text>
              <Text style={styles.modalText}>
                You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </Text>

              <Text style={styles.modalSectionTitle}>4. Prohibited Conduct</Text>
              <Text style={styles.modalText}>
                You agree not to use the app for any unlawful purpose, to harass others, to share inappropriate content, or to violate any applicable laws or regulations.
              </Text>

              <Text style={styles.modalSectionTitle}>5. Termination</Text>
              <Text style={styles.modalText}>
                We reserve the right to suspend or terminate your account at our sole discretion, without notice, for conduct that violates these terms or is harmful to other users.
              </Text>

              <Text style={styles.modalSectionTitle}>6. Limitation of Liability</Text>
              <Text style={styles.modalText}>
                The app is provided "as is" without warranties of any kind. We shall not be liable for any indirect, incidental, or consequential damages arising from your use of the app.
              </Text>

              <Text style={styles.modalSectionTitle}>7. Changes to Terms</Text>
              <Text style={styles.modalText}>
                We may modify these terms at any time. Continued use of the app after changes constitutes acceptance of the new terms.
              </Text>

              <Text style={styles.modalFooterText}>
                Last updated: {new Date().toLocaleDateString()}
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalButton} onPress={() => setShowTermsModal(false)}>
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal
        visible={showPrivacyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Privacy Policy</Text>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalContent}
            >
              <Text style={styles.modalSectionTitle}>1. Information We Collect</Text>
              <Text style={styles.modalText}>
                We collect the following personal information when you register:
                {'\n\n'}• Full Name
                {'\n'}• Phone Number
                {'\n'}• Date of Birth
              </Text>

              <Text style={styles.modalSectionTitle}>2. How We Use Your Information</Text>
              <Text style={styles.modalText}>
                We use your information to:
                {'\n\n'}• Create and manage your account
                {'\n'}• Verify your identity and age
                {'\n'}• Communicate with you about the service
                {'\n'}• Improve our app and user experience
                {'\n'}• Comply with legal obligations
              </Text>

              <Text style={styles.modalSectionTitle}>3. Data Sharing</Text>
              <Text style={styles.modalText}>
                We do not sell your personal information. We may share your data with:
                {'\n\n'}• Service providers who assist in app operations
                {'\n'}• Law enforcement when required by law
                {'\n'}• With your explicit consent
              </Text>

              <Text style={styles.modalSectionTitle}>4. Data Security</Text>
              <Text style={styles.modalText}>
                We implement industry-standard security measures to protect your personal information, including encryption, secure servers, and regular security audits.
              </Text>

              <Text style={styles.modalSectionTitle}>5. Your Rights</Text>
              <Text style={styles.modalText}>
                You have the right to:
                {'\n\n'}• Access your personal data
                {'\n'}• Correct inaccurate data
                {'\n'}• Request deletion of your data
                {'\n'}• Withdraw consent at any time
              </Text>

              <Text style={styles.modalSectionTitle}>6. Data Retention</Text>
              <Text style={styles.modalText}>
                We retain your personal information for as long as your account is active or as needed to provide services. You may request account deletion at any time.
              </Text>

              <Text style={styles.modalSectionTitle}>7. Contact Us</Text>
              <Text style={styles.modalText}>
                If you have questions about this Privacy Policy, please contact us at: privacy@yourapp.com
              </Text>

              <Text style={styles.modalFooterText}>
                Last updated: {new Date().toLocaleDateString()}
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalButton} onPress={() => setShowPrivacyModal(false)}>
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
  },
  backButton: {
    marginBottom: 12,
    alignSelf: 'flex-start',
    zIndex: 1,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
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
    paddingVertical: 14,
    borderRadius: 12,
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
  // Modal styles with proper spacing
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '90%',
    maxHeight: '85%',
    overflow: 'hidden',
    marginVertical: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333',
  },
  modalClose: {
    fontSize: 24,
    color: '#666',
    fontWeight: '600',
  },
  modalContent: {
    padding: 20,
    paddingBottom: 30,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PURPLE,
    marginTop: 16,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
    marginBottom: 8,
  },
  modalFooterText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  modalButton: {
    backgroundColor: PURPLE,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    margin: 16,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});