import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import type { ReceiverWithdrawalOverviewResponse } from '../../types/api';
import {
  receiverPaymentDetailsComplete,
  receiverPaymentFormValid,
  type ReceiverPayoutMethod,
} from '../../utils/receiverPaymentDetails';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverBankDetails'>;
type Route = RouteProp<ReceiverStackParamList, 'ReceiverBankDetails'>;
type Phase = 'choose' | 'form' | 'otp';

export default function ReceiverBankDetailsScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user, refreshUser } = useAuth();

  const initialMethod = route.params?.method ?? null;

  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overview, setOverview] = useState<ReceiverWithdrawalOverviewResponse | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>(initialMethod ? 'form' : 'choose');
  const [payoutMethod, setPayoutMethod] = useState<ReceiverPayoutMethod | null>(initialMethod);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentOtp, setPaymentOtp] = useState('');

  const [nameAsPerAadhaar, setNameAsPerAadhaar] = useState(user?.nameAsPerAadhaar ?? '');
  const [upiId, setUpiId] = useState(user?.upiId ?? '');
  const [bankAccountNumber, setBankAccountNumber] = useState(String(user?.bankAccountNumber ?? ''));
  const [bankIfsc, setBankIfsc] = useState(String(user?.bankIfsc ?? ''));
  const [aadhaarNumber, setAadhaarNumber] = useState(String(user?.aadhaarNumber ?? ''));
  const [panNumber, setPanNumber] = useState(String(user?.panNumber ?? ''));

  const paymentComplete = useMemo(() => {
    if (overview?.payment?.complete) return true;
    return receiverPaymentDetailsComplete(user);
  }, [overview?.payment?.complete, user]);

  const paymentFormValid = useMemo(() => {
    if (!payoutMethod) return false;
    return receiverPaymentFormValid(
      {
        nameAsPerAadhaar,
        upiId,
        aadhaarNumber,
        panNumber,
        bankAccountNumber,
        bankIfsc,
      },
      payoutMethod,
    );
  }, [nameAsPerAadhaar, upiId, aadhaarNumber, panNumber, bankAccountNumber, bankIfsc, payoutMethod]);

  const maskedMobile = useMemo(() => {
    const d = String(user?.phone ?? '').replace(/\D/g, '');
    if (d.length < 4) return d || 'your mobile';
    return `******${d.slice(-4)}`;
  }, [user?.phone]);

  const headerTitle = useMemo(() => {
    if (phase === 'choose') return 'Payout method';
    if (phase === 'otp') return 'Verify details';
    if (payoutMethod === 'bank') return 'Bank details';
    return 'UPI details';
  }, [phase, payoutMethod]);

  const loadOverview = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setOverviewLoading(true);
    setOverviewError(null);
    try {
      const { data } = await profileApi.receiverWithdrawalOverview();
      setOverview(data);
    } catch (e) {
      const msg = getErrorMessage(e);
      if (!msg.toLowerCase().includes('payment details')) {
        setOverviewError(msg);
      }
      setOverview(null);
    } finally {
      if (!opts?.silent) setOverviewLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setNameAsPerAadhaar(user?.nameAsPerAadhaar ?? '');
      setUpiId(user?.upiId ?? '');
      setBankAccountNumber(String(user?.bankAccountNumber ?? ''));
      setBankIfsc(String(user?.bankIfsc ?? ''));
      setAadhaarNumber(String(user?.aadhaarNumber ?? ''));
      setPanNumber(String(user?.panNumber ?? ''));
      void loadOverview();
    }, [loadOverview, user]),
  );

  const onBack = () => {
    if (phase === 'otp') {
      setPhase('form');
      return;
    }
    if (phase === 'form' && !initialMethod) {
      setPhase('choose');
      setPayoutMethod(null);
      return;
    }
    navigation.goBack();
  };

  const onSelectMethod = (method: ReceiverPayoutMethod) => {
    setPayoutMethod(method);
    setPhase('form');
  };

  const onSavePaymentSendOtp = async () => {
    if (!payoutMethod || !paymentFormValid) {
      Alert.alert(
        'Validation',
        payoutMethod === 'upi'
          ? 'Enter name as per Aadhaar, 12-digit Aadhaar number, and a valid UPI ID. PAN is optional.'
          : 'Enter name as per Aadhaar, 12-digit Aadhaar number, bank account number, and IFSC. PAN is optional.',
      );
      return;
    }

    const aadhaarDigits = aadhaarNumber.replace(/\D/g, '');
    const pan = panNumber.trim().toUpperCase();
    const bankDigits = bankAccountNumber.replace(/\D/g, '');
    const ifsc = bankIfsc.trim().toUpperCase();

    setPaymentBusy(true);
    try {
      await profileApi.sendReceiverBankUpdateOtp({
        nameAsPerAadhaar: nameAsPerAadhaar.trim(),
        aadhaarNumber: aadhaarDigits,
        payoutMethod,
        ...(pan ? { panNumber: pan } : {}),
        ...(payoutMethod === 'upi' ? { upiId: upiId.trim().toLowerCase() } : {}),
        ...(payoutMethod === 'bank'
          ? { bankAccountNumber: bankDigits, bankIfsc: ifsc }
          : {}),
      });
      setPaymentOtp('');
      setPhase('otp');
    } catch (e) {
      Alert.alert('Failed', getErrorMessage(e));
    } finally {
      setPaymentBusy(false);
    }
  };

  const onVerifyPaymentOtp = async () => {
    if (!/^\d{6}$/.test(paymentOtp.trim())) {
      Alert.alert('Validation', 'Enter valid 6-digit OTP.');
      return;
    }
    setPaymentBusy(true);
    try {
      await profileApi.verifyReceiverBankUpdateOtp(paymentOtp.trim());
      await refreshUser();
      await loadOverview({ silent: true });
      setPhase(initialMethod ? 'form' : 'choose');
      setPayoutMethod(initialMethod);
      setPaymentOtp('');
      if (route.params?.returnToWithdraw) {
        navigation.replace('WithdrawEarnings');
      } else {
        navigation.goBack();
      }
    } catch (e) {
      Alert.alert('Verification failed', getErrorMessage(e));
    } finally {
      setPaymentBusy(false);
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
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Icon name="chevron-left" size={26} color="#1a1a1a" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <View style={styles.placeholder} />
          </View>

          {overviewLoading ? (
            <ActivityIndicator size="small" color="#7b2cff" style={{ marginVertical: 12 }} />
          ) : null}
          {overviewError ? <Text style={styles.errorText}>{overviewError}</Text> : null}

          {phase === 'choose' ? (
            <View>
              <Text style={styles.sectionHeading}>How would you like to get paid?</Text>
              <Text style={styles.chooseSub}>
                Choose UPI for instant transfers or bank account for IMPS payout.
              </Text>

              <TouchableOpacity
                style={styles.methodCard}
                activeOpacity={0.85}
                onPress={() => onSelectMethod('upi')}
              >
                <View style={styles.methodIconWrap}>
                  <Icon name="smartphone" size={22} color="#7b2cff" />
                </View>
                <View style={styles.methodTextWrap}>
                  <Text style={styles.methodTitle}>UPI</Text>
                  <Text style={styles.methodSub}>Pay to your UPI ID (e.g. name@bank)</Text>
                </View>
                <Icon name="chevron-right" size={22} color="#bbb" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.methodCard}
                activeOpacity={0.85}
                onPress={() => onSelectMethod('bank')}
              >
                <View style={styles.methodIconWrap}>
                  <Icon name="credit-card" size={22} color="#7b2cff" />
                </View>
                <View style={styles.methodTextWrap}>
                  <Text style={styles.methodTitle}>Bank account</Text>
                  <Text style={styles.methodSub}>Account number and IFSC for IMPS transfer</Text>
                </View>
                <Icon name="chevron-right" size={22} color="#bbb" />
              </TouchableOpacity>

              {paymentComplete && overview ? (
                <View style={styles.savedCard}>
                  <Text style={styles.savedLabel}>Current payout details</Text>
                  <Text style={styles.savedValue}>
                    {overview.bank.accountMasked || overview.payment?.upiMasked}
                  </Text>
                  <Text style={styles.savedSub}>
                    {overview.payment?.nameAsPerAadhaar ?? overview.bank.accountHolderName}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {phase === 'form' && payoutMethod ? (
            <View>
              <View style={styles.infoCard}>
                <Icon name="info" size={18} color="#A855F7" />
                <Text style={styles.infoText}>
                  Name and Aadhaar number are required. PAN is optional.
                </Text>
              </View>

              <Field
                label="Name as per Aadhaar *"
                value={nameAsPerAadhaar}
                onChangeText={setNameAsPerAadhaar}
                placeholder="Enter name exactly as on Aadhaar"
              />
              <Field
                label="Aadhaar number *"
                value={aadhaarNumber}
                onChangeText={(v) => setAadhaarNumber(v.replace(/\D/g, '').slice(0, 12))}
                keyboardType="numeric"
                placeholder="12-digit Aadhaar"
              />
              <Field
                label="PAN number (optional)"
                value={panNumber}
                onChangeText={(v) => setPanNumber(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder="ABCDE1234F"
              />

              {payoutMethod === 'upi' ? (
                <Field
                  label="UPI ID *"
                  value={upiId}
                  onChangeText={(v) => setUpiId(v.trim().toLowerCase())}
                  placeholder="yourname@bank"
                  autoCapitalize="none"
                />
              ) : (
                <>
                  <Field
                    label="Bank account number *"
                    value={bankAccountNumber}
                    onChangeText={(v) => setBankAccountNumber(v.replace(/\D/g, '').slice(0, 18))}
                    keyboardType="numeric"
                    placeholder="Account number"
                  />
                  <Field
                    label="IFSC code *"
                    value={bankIfsc}
                    onChangeText={(v) => setBankIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
                    placeholder="HDFC0001234"
                    autoCapitalize="none"
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.primaryWrap, (paymentBusy || !paymentFormValid) && styles.disabled]}
                onPress={() => void onSavePaymentSendOtp()}
                disabled={paymentBusy || !paymentFormValid}
              >
                <LinearGradient colors={['#7F00FF', '#A855F7', '#E100FF']} style={styles.primaryBtn}>
                  <Text style={styles.primaryText}>
                    {paymentBusy ? 'Sending OTP...' : 'Save payment details'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {phase === 'otp' ? (
            <View style={styles.otpBlock}>
              <Text style={styles.otpTitle}>Verify Payment Details</Text>
              <Text style={styles.otpSub}>OTP sent to {maskedMobile}</Text>
              <TextInput
                value={paymentOtp}
                onChangeText={setPaymentOtp}
                keyboardType="number-pad"
                maxLength={6}
                style={styles.otpInput}
                textAlign="center"
              />
              <TouchableOpacity
                style={[styles.primaryWrap, paymentBusy && styles.disabled]}
                onPress={() => void onVerifyPaymentOtp()}
                disabled={paymentBusy}
              >
                <LinearGradient colors={['#7F00FF', '#A855F7', '#E100FF']} style={styles.primaryBtn}>
                  <Text style={styles.primaryText}>{paymentBusy ? 'Verifying...' : 'Verify & save'}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPhase('form')}>
                <Text style={styles.linkText}>Edit details</Text>
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
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric';
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={styles.input}
        placeholder={placeholder ?? label}
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
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  placeholder: { width: 40, height: 40 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  sectionHeading: { fontSize: 15, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  chooseSub: { fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 18 },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  methodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodTextWrap: { flex: 1 },
  methodTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  methodSub: { fontSize: 12, color: '#666', marginTop: 3, lineHeight: 16 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    gap: 8,
  },
  infoText: { flex: 1, fontSize: 12, color: '#6B21A8', fontWeight: '500' },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1a1a1a',
  },
  primaryWrap: { marginTop: 8, borderRadius: 12, overflow: 'hidden' },
  primaryBtn: { paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.55 },
  otpBlock: { alignItems: 'center', paddingVertical: 12 },
  otpTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  otpSub: { fontSize: 13, color: '#666', marginVertical: 8 },
  otpInput: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    marginBottom: 12,
  },
  linkText: { color: '#A855F7', fontWeight: '600', marginTop: 8 },
  savedCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  savedLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  savedValue: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginTop: 4 },
  savedSub: { fontSize: 13, color: '#444', marginTop: 2 },
  errorText: { fontSize: 13, color: '#dc2626', marginBottom: 8 },
});
