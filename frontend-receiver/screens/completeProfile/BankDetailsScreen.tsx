import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Linking,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { useCompleteProfile, type BankAccountType } from '../../context/CompleteProfileContext';
import { inferResourceType, uploadToCloudinary } from '../../lib/cloudinary';
import type { CompleteProfileStackParamList } from '../../navigation/CompleteProfileStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import { validateCompleteProfile } from '../../utils/completeProfileSteps';

type Props = NativeStackScreenProps<CompleteProfileStackParamList, 'BankDetails'>;

const PURPLE = '#7b2cff';

export default function BankDetailsScreen({ navigation, route }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { state, update } = useCompleteProfile();
  const { user, refreshUser, applyServerUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const agreedToPolicies = state.kycTermsAccepted;

  React.useEffect(() => {
    if (route.params?.agreedToPolicies && !state.kycTermsAccepted) {
      update({ kycTermsAccepted: true });
    }
  }, [route.params?.agreedToPolicies, state.kycTermsAccepted, update]);

  React.useEffect(() => {
    if (route.params?.autoSubmit && !submitting && agreedToPolicies) {
      navigation.setParams({ autoSubmit: undefined });
      void onSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.autoSubmit, agreedToPolicies, submitting, navigation]);

  const setAccountType = (t: BankAccountType) => update({ bankAccountType: t });

  const onSubmit = async () => {
    if (!agreedToPolicies) {
      Alert.alert('Validation', 'You must agree to the Terms & Conditions and Privacy Policy');
      return;
    }

    const err = validateCompleteProfile(state);
    if (err) {
      Alert.alert('Validation', err);
      return;
    }
    if (!state.profileImageUri || !state.aadhaarFront || !state.aadhaarBack || !state.panFront) {
      Alert.alert('Validation', 'Missing required files');
      return;
    }
    const dobStr = user?.dateOfBirth?.trim();
    if (!dobStr) {
      Alert.alert(
        'Date of birth required',
        'Your account is missing a date of birth. Please sign out and register again, or contact support.'
      );
      return;
    }
    if (state.gender === 'female' && !state.receiverVoiceUiDone) {
      navigation.navigate('AudioVerification', { agreedToPolicies: true });
      return;
    }

    setSubmitting(true);
    try {
      const profileImageUrl = /^https?:\/\//i.test(state.profileImageUri)
        ? state.profileImageUri.trim()
        : (
            await uploadToCloudinary(state.profileImageUri, {
              mimeType: state.profileImageMime ?? 'image/jpeg',
              resourceType: 'image',
              fileName: 'profile.jpg',
            })
          ).secure_url;

      const frontRes = await uploadToCloudinary(state.aadhaarFront.uri, {
        mimeType: state.aadhaarFront.mimeType,
        resourceType: inferResourceType(state.aadhaarFront.mimeType),
        fileName: state.aadhaarFront.name,
      });

      const backRes = await uploadToCloudinary(state.aadhaarBack.uri, {
        mimeType: state.aadhaarBack.mimeType,
        resourceType: inferResourceType(state.aadhaarBack.mimeType),
        fileName: state.aadhaarBack.name,
      });
      const panFrontRes = await uploadToCloudinary(state.panFront.uri, {
        mimeType: state.panFront.mimeType,
        resourceType: inferResourceType(state.panFront.mimeType),
        fileName: state.panFront.name,
      });

      const trimmedAudio = state.userAudio?.trim() ?? '';
      const payload = {
        name: state.displayName.trim(),
        profileImage: profileImageUrl,
        aadhaarFront: frontRes.secure_url,
        aadhaarBack: backRes.secure_url,
        aadhaarNumber: state.aadhaarNumber.trim(),
        panNumber: state.panNumber.trim().toUpperCase(),
        panFront: panFrontRes.secure_url,
        languages: state.languages,
        interests: state.interests,
        gender: state.gender!,
        dateOfBirth: dobStr,
        state: state.state.trim(),
        bankAccountHolderName: state.bankAccountHolderName.trim(),
        bankAccountType: state.bankAccountType,
        bankAccountNumber: state.bankAccountNumber.trim(),
        bankIfsc: state.bankIfsc.trim().toUpperCase(),
        bankName: state.bankName.trim(),
        ...(trimmedAudio && /^https?:\/\//i.test(trimmedAudio) ? { userAudio: trimmedAudio } : {}),
      };

      const { data } = await profileApi.complete(payload);

      applyServerUser(data.user);
      await refreshUser();
    } catch (e: unknown) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.bg}>
      <View style={styles.card}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(insets.top, 14) + 12, paddingBottom: Math.max(insets.bottom, 14) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            title="Apply for KYC"
            subtitle="Step 3 of 3"
            navigation={navigation}
          />
          <Text style={styles.title}>Add Bank Account</Text>
          <Text style={styles.subtitle}>Your earnings will be transferred to this account</Text>

          <Input
            label="Account holder name *"
            value={state.bankAccountHolderName}
            onChangeText={(t) => update({ bankAccountHolderName: t })}
            placeholder="As per bank records"
            autoCapitalize="words"
          />
          <Text style={styles.helper}>Must match the name on your ID document.</Text>

          <Text style={styles.fieldLabel}>Account type *</Text>
          <View style={styles.segmentWrap}>
            <TouchableOpacity
              style={[
                styles.segment,
                state.bankAccountType === 'savings' && styles.segmentActive,
              ]}
              onPress={() => setAccountType('savings')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.segmentText,
                  state.bankAccountType === 'savings' && styles.segmentTextActive,
                ]}
              >
                Savings
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segment,
                state.bankAccountType === 'current' && styles.segmentActive,
              ]}
              onPress={() => setAccountType('current')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.segmentText,
                  state.bankAccountType === 'current' && styles.segmentTextActive,
                ]}
              >
                Current
              </Text>
            </TouchableOpacity>
          </View>

          <Input
            label="Account number *"
            value={state.bankAccountNumber}
            onChangeText={(t) => update({ bankAccountNumber: t })}
            placeholder="Enter account number"
            keyboardType="number-pad"
          />

          <Input
            label="Confirm account number *"
            value={state.bankConfirmAccountNumber}
            onChangeText={(t) => update({ bankConfirmAccountNumber: t })}
            placeholder="Re-enter account number"
            keyboardType="number-pad"
          />

          <Input
            label="IFSC code *"
            value={state.bankIfsc}
            onChangeText={(t) => update({ bankIfsc: t.toUpperCase() })}
            placeholder="E.g. SBIN0001234"
            autoCapitalize="characters"
            maxLength={11}
          />
          <Text style={styles.helper}>11-character code (e.g. SBIN0001234)</Text>

          <Input
            label="Bank name *"
            value={state.bankName}
            onChangeText={(t) => update({ bankName: t })}
            placeholder="e.g. State Bank of India"
            autoCapitalize="words"
          />

          {/* Financial Information Note */}
          <View style={styles.financialNoteBox}>
            <Text style={styles.financialNoteTitle}>💰 Important Financial Information</Text>
            <Text style={styles.financialNoteText}>
              • Your earnings will be automatically transferred to this bank account every week
            </Text>
            <Text style={styles.financialNoteText}>
              • Minimum withdrawal amount: ₹100
            </Text>
            <Text style={styles.financialNoteText}>
              • Processing time: 2-3 business days
            </Text>
            <Text style={styles.financialNoteText}>
              • TDS will be deducted as per government regulations
            </Text>
            <Text style={styles.financialNoteText}>
              • Bank verification may take 24-48 hours
            </Text>
          </View>

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              <Text style={styles.noteBold}>Important: </Text>
              Please ensure all details are correct. Incorrect bank information may delay your
              payments. You can update these details later from settings.
            </Text>
          </View>

          {/* Terms & Conditions and Privacy Policy Checkbox */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => update({ kycTermsAccepted: !state.kycTermsAccepted })}
          >
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

          <Button
            title="Submit application"
            onPress={onSubmit}
            loading={submitting}
            disabled={submitting}
          />
        </ScrollView>
      </View>

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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalSectionTitle}>1. Platform Usage</Text>
              <Text style={styles.modalText}>
                This platform connects callers with receivers. You agree to use the platform only for its intended purpose and comply with all applicable laws.
              </Text>

              <Text style={styles.modalSectionTitle}>2. Payment Terms</Text>
              <Text style={styles.modalText}>
                Payments are processed weekly. The platform charges a 20% commission on all earnings. Payouts are subject to bank verification and may take 2-3 business days.
              </Text>

              <Text style={styles.modalSectionTitle}>3. KYC Compliance</Text>
              <Text style={styles.modalText}>
                You must provide accurate KYC documents including Aadhaar and PAN. Any false information may result in account termination.
              </Text>

              <Text style={styles.modalSectionTitle}>4. Code of Conduct</Text>
              <Text style={styles.modalText}>
                You agree to maintain professional behavior during calls. Any violation may lead to account suspension and forfeiture of pending payments.
              </Text>

              <Text style={styles.modalSectionTitle}>5. Account Suspension</Text>
              <Text style={styles.modalText}>
                We reserve the right to suspend or terminate accounts that violate our policies. Pending payments may be held during investigation.
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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalSectionTitle}>1. Information We Collect</Text>
              <Text style={styles.modalText}>
                We collect personal information including your name, email, phone number, date of birth, address, KYC documents (Aadhaar, PAN), and bank account details.
              </Text>

              <Text style={styles.modalSectionTitle}>2. How We Use Your Data</Text>
              <Text style={styles.modalText}>
                Your information is used for identity verification, payment processing, legal compliance, and platform security. Bank details are securely stored for payout processing.
              </Text>

              <Text style={styles.modalSectionTitle}>3. Data Security</Text>
              <Text style={styles.modalText}>
                All sensitive data including bank details and KYC documents are encrypted using industry-standard protocols. We use secure payment gateways for all financial transactions.
              </Text>

              <Text style={styles.modalSectionTitle}>4. Sharing Your Information</Text>
              <Text style={styles.modalText}>
                We do not sell your personal information. Bank details are shared only with our payment partners for processing payouts. KYC data is shared with government-mandated verification agencies.
              </Text>

              <Text style={styles.modalSectionTitle}>5. Your Rights</Text>
              <Text style={styles.modalText}>
                You have the right to access, correct, or delete your personal information. Bank account details can be updated through the app settings.
              </Text>

              <Text style={styles.modalSectionTitle}>6. Data Retention</Text>
              <Text style={styles.modalText}>
                Your data is retained for as long as your account is active and as required by tax and banking regulations (up to 7 years).
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

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#f4f4f5',
  },
  card: {
    width: '100%',
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 0,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  helper: {
    fontSize: 11,
    color: '#888',
    marginTop: -10,
    marginBottom: 14,
  },
  segmentWrap: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  segmentActive: {
    borderColor: PURPLE,
    backgroundColor: 'rgba(123,44,255,0.08)',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },
  segmentTextActive: {
    color: PURPLE,
  },
  noteBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    marginTop: 4,
  },
  noteText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  noteBold: {
    fontWeight: '800',
    color: '#333',
  },
  financialNoteBox: {
    backgroundColor: '#e8f4f8',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: PURPLE,
  },
  financialNoteTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111',
    marginBottom: 10,
  },
  financialNoteText: {
    fontSize: 11,
    color: '#444',
    lineHeight: 18,
    marginBottom: 4,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
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
  linkText: {
    color: PURPLE,
    textDecorationLine: 'underline',
  },
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