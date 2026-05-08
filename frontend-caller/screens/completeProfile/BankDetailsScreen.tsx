import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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

export default function BankDetailsScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { state, update } = useCompleteProfile();
  const { user, refreshUser, applyServerUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const setAccountType = (t: BankAccountType) => update({ bankAccountType: t });

  const onSubmit = async () => {
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

      const { data } = await profileApi.complete({
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
      });

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

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              <Text style={styles.noteBold}>Important: </Text>
              Please ensure all details are correct. Incorrect bank information may delay your
              payments. You can update these details later from settings.
            </Text>
          </View>

          <Button
            title="Submit application"
            onPress={onSubmit}
            loading={submitting}
            disabled={submitting}
          />
        </ScrollView>
      </View>
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
});
