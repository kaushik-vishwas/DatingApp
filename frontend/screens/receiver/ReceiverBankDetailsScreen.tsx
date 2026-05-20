import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useAuth } from '../../context/AuthContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverBankDetails'>;

type Step = 'form' | 'otp' | 'success';

export default function ReceiverBankDetailsScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [holderName, setHolderName] = useState(user?.bankAccountHolderName ?? '');
  const accountType = 'savings';
  const [accountNumber, setAccountNumber] = useState(user?.bankAccountNumber ?? '');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState(user?.bankAccountNumber ?? '');
  const [ifsc, setIfsc] = useState(user?.bankIfsc ?? '');
  const [bankName, setBankName] = useState(user?.bankName ?? '');
  
  const formValid =
    Boolean(holderName.trim()) &&
    Boolean(accountNumber.trim()) &&
    Boolean(confirmAccountNumber.trim()) &&
    Boolean(ifsc.trim()) &&
    Boolean(bankName.trim()) &&
    accountNumber.trim() === confirmAccountNumber.trim();
    
    const fullMobile = user?.phone ?? 'your mobile';

  const sendOtp = async () => {
    if (!holderName.trim() || !accountNumber.trim() || !ifsc.trim() || !bankName.trim()) {
      Alert.alert('Validation', 'Please fill all fields.');
      return;
    }
    if (accountNumber.trim() !== confirmAccountNumber.trim()) {
      Alert.alert('Validation', 'Account number does not match confirmation.');
      return;
    }
    setBusy(true);
    try {
      await profileApi.sendReceiverBankUpdateOtp({
        bankAccountHolderName: holderName.trim(),
        bankAccountType: accountType,
        bankAccountNumber: accountNumber.trim(),
        bankIfsc: ifsc.trim().toUpperCase(),
        bankName: bankName.trim(),
      });
      setStep('otp');
    } catch (e) {
      Alert.alert('Failed', getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      Alert.alert('Validation', 'Enter valid 6-digit OTP.');
      return;
    }
    setBusy(true);
    try {
      await profileApi.verifyReceiverBankUpdateOtp(otp.trim());
      await refreshUser();
      setStep('success');
    } catch (e) {
      Alert.alert('Verification failed', getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
              <Icon name="chevron-left" size={26} color="#1a1a1a" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Bank Details</Text>
            <View style={styles.placeholder} /> 
          </View>

          {step === 'form' ? (
            <View style={styles.formSection}>
              {/* Info Card */}
              <View style={styles.infoCard}>
                <Icon name="info" size={20} color="#A855F7" />
                <Text style={styles.infoText}>
                  Your earnings will be transferred to this bank account
                </Text>
              </View>

              <Field 
                label="Account Holder Name" 
                value={holderName} 
                onChangeText={setHolderName}
                placeholder="Enter account holder name"
              />
              
              <Field 
                label="Account Number" 
                value={accountNumber} 
                onChangeText={setAccountNumber} 
                keyboardType="numeric"
                placeholder="Enter account number"
              />
              
              <Field 
                label="Confirm Account Number" 
                value={confirmAccountNumber} 
                onChangeText={setConfirmAccountNumber} 
                keyboardType="numeric"
                placeholder="Re-enter account number"
              />
              
              <Field 
                label="IFSC Code" 
                value={ifsc} 
                onChangeText={setIfsc}
                placeholder="Enter IFSC code"
              />
              
              <Field 
                label="Bank Name" 
                value={bankName} 
                onChangeText={setBankName}
                placeholder="Enter bank name"
              />

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitBtnWrapper, (busy || !formValid) && styles.submitBtnDisabled]}
                onPress={sendOtp}
                disabled={busy || !formValid}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#7F00FF', '#A855F7', '#E100FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitBtn}
                >
                  <Text style={styles.submitText}>
                    {busy ? 'Sending OTP...' : 'Continue'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {step === 'otp' ? (
            <View style={styles.otpSection}>
              <View style={styles.otpIconContainer}>
                <Icon name="smartphone" size={48} color="#A855F7" />
              </View>
              <Text style={styles.otpTitle}>Verify Your Identity</Text>
              <Text style={styles.otpSubtitle}>
                Enter the 6-digit verification code sent to
              </Text>
              <Text style={styles.mobileNumber}>{fullMobile}</Text>
              
              <TextInput
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="••••••"
                placeholderTextColor="#bbb"
                style={styles.otpInput}
                textAlign="center"
              />
              
              <TouchableOpacity
                style={[styles.verifyBtnWrapper, busy && styles.verifyBtnDisabled]}
                onPress={verifyOtp}
                disabled={busy}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#7F00FF', '#A855F7', '#E100FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.verifyBtn}
                >
                  <Text style={styles.verifyText}>
                    {busy ? 'Verifying...' : 'Verify & Continue'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {step === 'success' ? (
            <View style={styles.successCard}>
              <View style={styles.successIconContainer}>
                <Icon name="check" size={40} color="#FFFFFF" />
              </View>
              <Text style={styles.successTitle}>Bank Account Verified!</Text>
              <Text style={styles.successSub}>
                Your bank details have been successfully updated
              </Text>
              <TouchableOpacity
                style={styles.successBtnWrapper}
                onPress={() => navigation.goBack()}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#7F00FF', '#A855F7', '#E100FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.successBtn}
                >
                  <Text style={styles.successBtnText}>Go to Dashboard</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('ReceiverProfilePreview')} activeOpacity={0.7}>
                <Text style={styles.previewLink}>View Profile Preview</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric';
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        style={styles.input}
        placeholder={placeholder || label}
        placeholderTextColor="#999"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  screen: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 24,
    paddingVertical: 8,
  },
  backBtn: { 
    width: 40, 
    height: 40, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  backText: { fontSize: 20, color: '#1a1a1a', fontWeight: '700' },
  headerTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  
  formSection: {
    marginBottom: 8,
  },
  
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#6B21A8',
    fontWeight: '500',
    lineHeight: 16,
  },
  
  fieldWrap: { 
    marginBottom: 16,
  },
  fieldLabel: { 
    fontSize: 13, 
    color: '#444', 
    fontWeight: '600', 
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  
  submitBtnWrapper: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#7F00FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { 
    opacity: 0.6,
  },
  submitText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  
  otpSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  otpIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  otpTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  otpSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  mobileNumber: {
    fontSize: 13,
    fontWeight: '400',
    color: '#A855F7',
    marginBottom: 24,
  },
  otpInput: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    color: '#1a1a1a',
    marginBottom: 20,
  },
  verifyBtnWrapper: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#7F00FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  verifyBtnDisabled: { 
    opacity: 0.6,
  },
  verifyText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  
  successCard: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  successSub: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  successBtnWrapper: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  successBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  successBtnText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  previewLink: { 
    color: '#A855F7', 
    fontSize: 13, 
    fontWeight: '600',
  },
});