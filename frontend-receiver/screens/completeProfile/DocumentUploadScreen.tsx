import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../../components/ui/Button';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { UploadField } from '../../components/ui/UploadField';
import { useCompleteProfile, type PickedDocument } from '../../context/CompleteProfileContext';
import type { CompleteProfileStackParamList } from '../../navigation/CompleteProfileStackParamList';
import { validateAadhaarDocuments, validateProfileInfo } from '../../utils/completeProfileSteps';

type Props = NativeStackScreenProps<CompleteProfileStackParamList, 'DocumentUpload'>;

async function pickAadhaarSide(
  onPicked: (doc: PickedDocument) => void
): Promise<void> {
  Alert.alert('Upload Aadhaar', 'Choose source', [
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
          name: a.fileName ?? 'aadhaar.jpg',
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

export default function DocumentUploadScreen({ navigation }: Props): React.JSX.Element {
  const { state, update } = useCompleteProfile();

  const onPickFront = async () => {
    await pickAadhaarSide((doc) => {
      update({ aadhaarFront: doc });
    });
  };

  const onPickBack = async () => {
    await pickAadhaarSide((doc) => {
      update({ aadhaarBack: doc });
    });
  };

  const onContinue = () => {
    const err =
      validateProfileInfo(state) || validateAadhaarDocuments(state);
    if (err) {
      Alert.alert('Validation', err);
      return;
    }
    navigation.navigate('BankDetails');
  };

  return (
    <View style={styles.bg}>
      <View style={styles.card}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader
            title="Verify your identity"
            subtitle="Step 2 of 3"
            navigation={navigation}
          />
          <Text style={styles.lead}>Add Aadhaar and PAN details. Images or PDF supported.</Text>

          <Text style={styles.fieldLabel}>Aadhaar number *</Text>
          <TextInput
            style={styles.input}
            value={state.aadhaarNumber}
            onChangeText={(t) => update({ aadhaarNumber: t.replace(/\D/g, '').slice(0, 12) })}
            placeholder="Enter 12-digit Aadhaar number"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            maxLength={12}
          />

          <UploadField
            label="Aadhaar — front *"
            uri={state.aadhaarFront?.uri ?? null}
            mimeType={state.aadhaarFront?.mimeType}
            displayName={state.aadhaarFront?.name}
            imageShape="rectangle"
            onPick={onPickFront}
            onClear={() => update({ aadhaarFront: null })}
            hint="PNG, JPG or PDF"
          />

          <UploadField
            label="Aadhaar — back *"
            uri={state.aadhaarBack?.uri ?? null}
            mimeType={state.aadhaarBack?.mimeType}
            displayName={state.aadhaarBack?.name}
            imageShape="rectangle"
            onPick={onPickBack}
            onClear={() => update({ aadhaarBack: null })}
            hint="PNG, JPG or PDF"
          />

          

          <Text style={styles.fieldLabel}>PAN number *</Text>
          <TextInput
            style={styles.input}
            value={state.panNumber}
            onChangeText={(t) => update({ panNumber: t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) })}
            placeholder="Enter PAN number (e.g. ABCDE1234F)"
            placeholderTextColor="#999"
            autoCapitalize="characters"
            maxLength={10}
          />

          <UploadField
            label="PAN — front *"
            uri={state.panFront?.uri ?? null}
            mimeType={state.panFront?.mimeType}
            displayName={state.panFront?.name}
            imageShape="rectangle"
            onPick={async () => {
              await pickAadhaarSide((doc) => update({ panFront: doc }));
            }}
            onClear={() => update({ panFront: null })}
            hint="PNG, JPG or PDF"
          />

          <View style={styles.row}>
            <Button title="Back" variant="outline" onPress={() => navigation.goBack()} style={styles.flex} />
            <Button title="Continue" onPress={onContinue} style={styles.flex} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  lead: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  flex: { flex: 1 },
});
