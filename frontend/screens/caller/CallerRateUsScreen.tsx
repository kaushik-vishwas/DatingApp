import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
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

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';

const PURPLE = '#7b2cff';
const MAX_LEN = 2000;

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerRateUs'>;

export default function CallerRateUsScreen({ navigation }: Props): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hadExisting, setHadExisting] = useState(false);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await profileApi.getCallerAppReview();
      if (data.exists && data.stars != null) {
        setHadExisting(true);
        setStars(data.stars);
        setReview(data.review ?? '');
      } else {
        setHadExisting(false);
        setStars(0);
        setReview('');
      }
    } catch (e) {
      Alert.alert('Rate Us', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onSave = () => {
    if (stars < 1 || stars > 5) {
      Alert.alert('Rating', 'Please choose a star rating from 1 to 5.');
      return;
    }
    void (async () => {
      setSaving(true);
      try {
        await profileApi.putCallerAppReview({ stars, review: review.trim().slice(0, MAX_LEN) });
        setHadExisting(true);
        Alert.alert('Thank you', hadExisting ? 'Your review was updated.' : 'Your review was saved.');
        navigation.goBack();
      } catch (e) {
        Alert.alert('Could not save', getErrorMessage(e));
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rate Us</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={PURPLE} />
          </View>
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.lead}>
              {hadExisting
                ? 'Update your rating or review anytime. Only one review is stored per account.'
                : 'Share a star rating and optional feedback. You can edit it later from here.'}
            </Text>

            <Text style={styles.section}>Your rating</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setStars(n)}
                  style={styles.starHit}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} stars`}
                >
                  <Ionicons
                    name={n <= stars ? 'star' : 'star-outline'}
                    size={40}
                    color={n <= stars ? '#f59e0b' : '#d1d5db'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.section}>Write a review (optional)</Text>
            <TextInput
              style={styles.input}
              multiline
              textAlignVertical="top"
              placeholder="Tell us what you like or what we can improve…"
              placeholderTextColor="#9ca3af"
              value={review}
              onChangeText={(t) => setReview(t.slice(0, MAX_LEN))}
              maxLength={MAX_LEN}
            />
            <Text style={styles.counter}>
              {review.length}/{MAX_LEN}
            </Text>

            <TouchableOpacity
              style={[styles.saveBtn, (saving || stars < 1) && styles.saveBtnOff]}
              disabled={saving || stars < 1}
              onPress={onSave}
              activeOpacity={0.9}
            >
              <Text style={styles.saveTxt}>{saving ? 'Saving…' : hadExisting ? 'Save changes' : 'Submit'}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 32, color: PURPLE, fontWeight: '300', marginTop: -4 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#111' },
  headerSpacer: { width: 44 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  lead: { fontSize: 14, color: '#666', lineHeight: 21, marginTop: 8, marginBottom: 8 },
  section: { marginTop: 22, marginBottom: 10, fontSize: 15, fontWeight: '800', color: '#222' },
  starRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  starHit: { padding: 6, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  counter: { alignSelf: 'flex-end', marginTop: 6, fontSize: 12, color: '#9ca3af' },
  saveBtn: {
    marginTop: 28,
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnOff: { opacity: 0.45 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
