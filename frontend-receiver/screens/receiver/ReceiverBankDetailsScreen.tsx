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
  const [emailMasked, setEmailMasked] = useState('');
  const [otp, setOtp] = useState('');
  const [holderName, setHolderName] = useState(user?.bankAccountHolderName ?? '');
  const [accountType, setAccountType] = useState<'savings' | 'current'>(
    user?.bankAccountType === 'current' ? 'current' : 'savings'
  );
  const [accountNumber, setAccountNumber] = useState(user?.bankAccountNumber ?? '');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState(user?.bankAccountNumber ?? '');
  const [ifsc, setIfsc] = useState(user?.bankIfsc ?? '');
  const [bankName, setBankName] = useState(user?.bankName ?? '');

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
      const { data } = await profileApi.sendReceiverBankUpdateOtp({
        bankAccountHolderName: holderName.trim(),
        bankAccountType: accountType,
        bankAccountNumber: accountNumber.trim(),
        bankIfsc: ifsc.trim().toUpperCase(),
        bankName: bankName.trim(),
      });
      setEmailMasked(data.emailMasked);
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
      >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Update Bank Account</Text>
        <View style={styles.backBtn} />
      </View>

      {step === 'form' ? (
        <>
          <Text style={styles.pageTitle}>Update Bank Account</Text>
          <Text style={styles.pageSub}>Your earnings will be transferred to this account.</Text>
          <Field label="Account holder name" value={holderName} onChangeText={setHolderName} />
          <Text style={styles.label}>Account Type</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, accountType === 'savings' && styles.typeActive]}
              onPress={() => setAccountType('savings')}
            >
              <Text style={[styles.typeText, accountType === 'savings' && styles.typeTextActive]}>Savings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, accountType === 'current' && styles.typeActive]}
              onPress={() => setAccountType('current')}
            >
              <Text style={[styles.typeText, accountType === 'current' && styles.typeTextActive]}>Current</Text>
            </TouchableOpacity>
          </View>
          <Field label="Account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="numeric" />
          <Field label="Confirm account number" value={confirmAccountNumber} onChangeText={setConfirmAccountNumber} keyboardType="numeric" />
          <Field label="IFSC code" value={ifsc} onChangeText={setIfsc} />
          <Field label="Bank name" value={bankName} onChangeText={setBankName} />

          <TouchableOpacity style={[styles.primaryBtn, busy && styles.disabled]} onPress={sendOtp} disabled={busy}>
            <Text style={styles.primaryText}>{busy ? 'Sending OTP...' : 'Submit Modification'}</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === 'otp' ? (
        <View style={styles.otpWrap}>
          <Text style={styles.pageTitle}>Verify Phone</Text>
          <Text style={styles.pageSub}>Enter Verification Code sent to {emailMasked}</Text>
          <TextInput
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="------"
            placeholderTextColor="#bbb"
            style={styles.otpInput}
          />
          <TouchableOpacity style={[styles.primaryBtn, busy && styles.disabled]} onPress={verifyOtp} disabled={busy}>
            <Text style={styles.primaryText}>{busy ? 'Verifying...' : 'Verify & Continue'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === 'success' ? (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>Congratulations</Text>
          <Text style={styles.successSub}>Your profile is updated!</Text>
          <TouchableOpacity style={styles.successBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.successBtnText}>Go Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('ReceiverProfilePreview')}>
            <Text style={styles.previewLink}>View Preview</Text>
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
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        style={styles.input}
        placeholder={label}
        placeholderTextColor="#aaa"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16, paddingBottom: 34 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#111', fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#111' },
  pageTitle: { fontSize: 22, color: '#111', fontWeight: '900', marginBottom: 6 },
  pageSub: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 8 },
  label: { fontSize: 11, color: '#666', fontWeight: '700', marginBottom: 5 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#111',
    fontWeight: '600',
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dedede',
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 8,
  },
  typeActive: { borderColor: '#7b2cff', backgroundColor: '#f5ecff' },
  typeText: { fontSize: 12, color: '#666', fontWeight: '700' },
  typeTextActive: { color: '#7b2cff' },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: '#7b2cff',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  otpWrap: { marginTop: 28 },
  otpInput: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    paddingVertical: 8,
    color: '#111',
    fontWeight: '800',
  },
  successCard: {
    marginTop: 28,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 16,
    alignItems: 'center',
  },
  successTitle: { fontSize: 20, color: '#111', fontWeight: '900' },
  successSub: { marginTop: 6, fontSize: 12, color: '#666', fontWeight: '600' },
  successBtn: {
    marginTop: 14,
    borderRadius: 8,
    backgroundColor: '#7b2cff',
    paddingVertical: 10,
    paddingHorizontal: 30,
  },
  successBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  previewLink: { marginTop: 10, color: '#7b2cff', fontSize: 12, fontWeight: '700' },
});
