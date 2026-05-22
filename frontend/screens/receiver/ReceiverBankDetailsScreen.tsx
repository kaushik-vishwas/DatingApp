import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
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

import { UploadField } from '../../components/ui/UploadField';
import { useAuth } from '../../context/AuthContext';
import { inferResourceType, uploadToCloudinary } from '../../lib/cloudinary';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import type { ReceiverWithdrawalOverviewResponse } from '../../types/api';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverBankDetails'>;
type Route = RouteProp<ReceiverStackParamList, 'ReceiverBankDetails'>;

type PickedDocument = { uri: string; name?: string; mimeType?: string };
type PaymentStep = 'form' | 'otp';

function isValidUpiId(upi: string): boolean {
  return /^[a-z0-9._-]{2,256}@[a-z]{3,}$/i.test(upi.trim());
}

function isValidAadhaarNumber(value: string): boolean {
  return /^\d{12}$/.test(value.replace(/\D/g, ''));
}

function isValidPanNumber(value: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value.trim().toUpperCase());
}

async function pickKycDocument(onPicked: (doc: PickedDocument) => void): Promise<void> {
  Alert.alert('Upload document', 'Choose source', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Photo library',
      onPress: async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission', 'Photo library access is required.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.9,
        });
        if (result.canceled || !result.assets[0]) return;
        const a = result.assets[0];
        onPicked({
          uri: a.uri,
          name: a.fileName ?? 'document.jpg',
          mimeType: a.mimeType ?? 'image/jpeg',
        });
      },
    },
    {
      text: 'Document (PDF)',
      onPress: async () => {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/*'],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets[0]) return;
        const a = result.assets[0];
        onPicked({
          uri: a.uri,
          name: a.name ?? 'document.pdf',
          mimeType: a.mimeType ?? 'application/pdf',
        });
      },
    },
  ]);
}

async function ensureUploadedUrl(doc: PickedDocument, fileName: string): Promise<string> {
  const raw = doc.uri.trim();
  if (/^https:\/\//i.test(raw)) return raw;
  const res = await uploadToCloudinary(raw, {
    mimeType: doc.mimeType,
    resourceType: inferResourceType(doc.mimeType ?? 'image/jpeg'),
    fileName: doc.name || fileName,
  });
  return res.secure_url;
}

export default function ReceiverBankDetailsScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user, refreshUser } = useAuth();

  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overview, setOverview] = useState<ReceiverWithdrawalOverviewResponse | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [paymentStep, setPaymentStep] = useState<PaymentStep>('form');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentOtp, setPaymentOtp] = useState('');

  const [nameAsPerAadhaar, setNameAsPerAadhaar] = useState(user?.nameAsPerAadhaar ?? '');
  const [upiId, setUpiId] = useState(user?.upiId ?? '');
  const [aadhaarNumber, setAadhaarNumber] = useState(String(user?.aadhaarNumber ?? ''));
  const [panNumber, setPanNumber] = useState(String(user?.panNumber ?? ''));
  const [aadhaarFront, setAadhaarFront] = useState<PickedDocument | null>(
    user?.aadhaarFront ? { uri: user.aadhaarFront, name: 'aadhaar-front' } : null,
  );
  const [aadhaarBack, setAadhaarBack] = useState<PickedDocument | null>(
    user?.aadhaarBack ? { uri: user.aadhaarBack, name: 'aadhaar-back' } : null,
  );
  const [panFront, setPanFront] = useState<PickedDocument | null>(
    user?.panFront ? { uri: user.panFront, name: 'pan-front' } : null,
  );

  const paymentComplete = useMemo(() => {
    if (overview?.payment?.complete) return true;
    return Boolean(
      user?.nameAsPerAadhaar?.trim() &&
        user?.upiId?.trim() &&
        isValidUpiId(user.upiId) &&
        isValidAadhaarNumber(String(user?.aadhaarNumber ?? '')) &&
        isValidPanNumber(String(user?.panNumber ?? '')),
    );
  }, [overview?.payment?.complete, user?.nameAsPerAadhaar, user?.upiId, user?.aadhaarNumber, user?.panNumber]);

  const paymentFormValid = useMemo(
    () =>
      Boolean(
        nameAsPerAadhaar.trim() &&
          upiId.trim() &&
          isValidUpiId(upiId) &&
          isValidAadhaarNumber(aadhaarNumber) &&
          isValidPanNumber(panNumber),
      ),
    [nameAsPerAadhaar, upiId, aadhaarNumber, panNumber],
  );

  const maskedMobile = useMemo(() => {
    const d = String(user?.phone ?? '').replace(/\D/g, '');
    if (d.length < 4) return d || 'your mobile';
    return `******${d.slice(-4)}`;
  }, [user?.phone]);

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
      setAadhaarNumber(String(user?.aadhaarNumber ?? ''));
      setPanNumber(String(user?.panNumber ?? ''));
      void loadOverview();
    }, [loadOverview, user]),
  );

  const onSavePaymentSendOtp = async () => {
    if (!paymentFormValid) {
      Alert.alert(
        'Validation',
        'Fill all required fields: name as per Aadhaar, UPI ID, 12-digit Aadhaar number, and valid PAN.',
      );
      return;
    }
    const aadhaarDigits = aadhaarNumber.replace(/\D/g, '');
    const pan = panNumber.trim().toUpperCase();

    setPaymentBusy(true);
    try {
      let aadhaarFrontUrl: string | undefined;
      let aadhaarBackUrl: string | undefined;
      let panFrontUrl: string | undefined;
      if (aadhaarFront) aadhaarFrontUrl = await ensureUploadedUrl(aadhaarFront, 'aadhaar-front');
      if (aadhaarBack) aadhaarBackUrl = await ensureUploadedUrl(aadhaarBack, 'aadhaar-back');
      if (panFront) panFrontUrl = await ensureUploadedUrl(panFront, 'pan-front');

      await profileApi.sendReceiverBankUpdateOtp({
        nameAsPerAadhaar: nameAsPerAadhaar.trim(),
        upiId: upiId.trim().toLowerCase(),
        aadhaarNumber: aadhaarDigits,
        panNumber: pan,
        ...(aadhaarFrontUrl ? { aadhaarFront: aadhaarFrontUrl } : {}),
        ...(aadhaarBackUrl ? { aadhaarBack: aadhaarBackUrl } : {}),
        ...(panFrontUrl ? { panFront: panFrontUrl } : {}),
      });
      setPaymentOtp('');
      setPaymentStep('otp');
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
      setPaymentStep('form');
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

  const headerTitle = route.params?.returnToWithdraw ? 'Payment details' : 'Payment Details';

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
              <Icon name="chevron-left" size={26} color="#1a1a1a" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <View style={styles.placeholder} />
          </View>

          {overviewLoading ? (
            <ActivityIndicator size="small" color="#7b2cff" style={{ marginVertical: 12 }} />
          ) : null}
          {overviewError ? <Text style={styles.errorText}>{overviewError}</Text> : null}

          {/* Payment details */}
          <Text style={styles.sectionHeading}>Payment details</Text>
          <View style={styles.infoCard}>
            <Icon name="info" size={18} color="#A855F7" />
            <Text style={styles.infoText}>
              All fields are required. Check details before saving. 
            </Text>
          </View>

          {paymentStep === 'form' ? (
            <View>
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
                label="PAN number *"
                value={panNumber}
                onChangeText={(v) => setPanNumber(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder="ABCDE1234F"
              />
               <Field
                label="UPI ID *"
                value={upiId}
                onChangeText={(v) => setUpiId(v.trim().toLowerCase())}
                placeholder="yourname@bank"
                autoCapitalize="none"
              />

              {/* <Text style={styles.optionalHeading}>Optional document uploads</Text>
              <UploadField
                label="Aadhaar front (optional)"
                uri={aadhaarFront?.uri ?? null}
                mimeType={aadhaarFront?.mimeType}
                displayName={aadhaarFront?.name}
                imageShape="rectangle"
                onPick={() => void pickKycDocument(setAadhaarFront)}
                onClear={() => setAadhaarFront(null)}
              />
              <UploadField
                label="Aadhaar back (optional)"
                uri={aadhaarBack?.uri ?? null}
                mimeType={aadhaarBack?.mimeType}
                displayName={aadhaarBack?.name}
                imageShape="rectangle"
                onPick={() => void pickKycDocument(setAadhaarBack)}
                onClear={() => setAadhaarBack(null)}
              />
              <UploadField
                label="PAN front (optional)"
                uri={panFront?.uri ?? null}
                mimeType={panFront?.mimeType}
                displayName={panFront?.name}
                imageShape="rectangle"
                onPick={() => void pickKycDocument(setPanFront)}
                onClear={() => setPanFront(null)}
              /> */}

              <TouchableOpacity
                style={[styles.primaryWrap, (paymentBusy || !paymentFormValid) && styles.disabled]}
                onPress={() => void onSavePaymentSendOtp()}
                disabled={paymentBusy || !paymentFormValid}
              >
                <LinearGradient colors={['#7F00FF', '#A855F7', '#E100FF']} style={styles.primaryBtn}>
                  <Text style={styles.primaryText}>{paymentBusy ? 'Sending OTP...' : 'Save payment details'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {paymentStep === 'otp' ? (
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
              <TouchableOpacity onPress={() => setPaymentStep('form')}>
                <Text style={styles.linkText}>Edit details</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {paymentComplete && overview ? (
            <View style={styles.savedCard}>
              <Text style={styles.savedLabel}>Saved UPI</Text>
              <Text style={styles.savedValue}>{overview.payment?.upiMasked ?? overview.bank.accountMasked}</Text>
              <Text style={styles.savedSub}>
                {overview.payment?.nameAsPerAadhaar ?? overview.bank.accountHolderName}
              </Text>
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
  sectionHeading: { fontSize: 15, fontWeight: '800', color: '#1a1a1a', marginBottom: 10 },
  optionalHeading: { fontSize: 13, fontWeight: '700', color: '#666', marginTop: 8, marginBottom: 8 },
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
  primaryBtn: { paddingVertical: 16, paddingHorizontal: 16,  alignItems: 'center' },
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
