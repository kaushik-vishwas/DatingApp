import Slider from '@react-native-community/slider';
import React from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CALLER_LANGUAGE_OPTIONS } from '../../constants/userOnboarding';

const PURPLE = '#7b2cff';

/** Figma order first, then any remaining onboarding languages. */
const FILTER_LANG_ORDER = ['Kannada', 'Tamil', 'Malayalam', 'Telugu', 'Hindi', 'English', 'Marathi'];
const ORDERED_FILTER_LANGUAGES = [
  ...FILTER_LANG_ORDER.filter((l) => CALLER_LANGUAGE_OPTIONS.includes(l)),
  ...CALLER_LANGUAGE_OPTIONS.filter((l) => !FILTER_LANG_ORDER.includes(l)),
];

const MAX_FILTER_LANGS = 5;

export type DiscoverFiltersState = {
  languages: string[];
  ageMin: number;
  ageMax: number;
  rating4Plus: boolean;
  onlineOnly: boolean;
};

export const DEFAULT_DISCOVER_FILTERS: DiscoverFiltersState = {
  languages: [],
  ageMin: 18,
  ageMax: 50,
  rating4Plus: false,
  onlineOnly: false,
};

/** Three-line filter glyph (purple), per design. */
export function DiscoverFilterIcon(): React.JSX.Element {
  return (
    <View style={glyphStyles.wrap}>
      <View style={[glyphStyles.bar, { width: '100%' }]} />
      <View style={[glyphStyles.bar, { width: '68%' }]} />
      <View style={[glyphStyles.bar, { width: '42%' }]} />
    </View>
  );
}

const glyphStyles = StyleSheet.create({
  wrap: { width: 20, height: 16, justifyContent: 'space-between' },
  bar: { height: 3, borderRadius: 2, backgroundColor: PURPLE, alignSelf: 'flex-start' },
});

type Props = {
  visible: boolean;
  draft: DiscoverFiltersState;
  setDraft: React.Dispatch<React.SetStateAction<DiscoverFiltersState>>;
  onClose: () => void;
  onReset: () => void;
  onApply: () => void;
};

export default function DiscoverFiltersModal({
  visible,
  draft,
  setDraft,
  onClose,
  onReset,
  onApply,
}: Props): React.JSX.Element {
  const toggleLang = (lang: string) => {
    setDraft((d) => {
      if (d.languages.includes(lang)) {
        return { ...d, languages: d.languages.filter((x) => x !== lang) };
      }
      if (d.languages.length >= MAX_FILTER_LANGS) {
        Alert.alert('Limit', `You can select up to ${MAX_FILTER_LANGS} languages.`);
        return d;
      }
      return { ...d, languages: [...d.languages, lang] };
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']} style={styles.sheetInner}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={onClose} style={styles.closeHit} hitSlop={12}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>Filters</Text>
              <View style={{ width: 36 }} />
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.secLabel}>language selections</Text>
              <View style={styles.rowWrap}>
                {ORDERED_FILTER_LANGUAGES.map((lang) => {
                  const on = draft.languages.includes(lang);
                  return (
                    <TouchableOpacity
                      key={lang}
                      style={[styles.pill, on && styles.pillOn]}
                      onPress={() => toggleLang(lang)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.pillTxt, on && styles.pillTxtOn]}>{lang}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.counter}>
                {draft.languages.length}/{MAX_FILTER_LANGS} selected
              </Text>

              <Text style={styles.secLabel}>Age range (18–50)</Text>
              <Text style={styles.ageHint}>
                Narrow results by age. Leave min 18 and max 50 to include all ages.
              </Text>
              <View style={styles.ageBlock}>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderLbl}>Min · {draft.ageMin}</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={18}
                    maximumValue={50}
                    step={1}
                    value={draft.ageMin}
                    minimumTrackTintColor={PURPLE}
                    maximumTrackTintColor="#e0e0e0"
                    thumbTintColor={PURPLE}
                    onValueChange={(v) => {
                      const n = Math.round(v);
                      setDraft((d) => {
                        let ageMin = Math.max(18, Math.min(50, n));
                        let ageMax = d.ageMax;
                        if (ageMin > ageMax) ageMax = ageMin;
                        return { ...d, ageMin, ageMax };
                      });
                    }}
                  />
                </View>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderLbl}>Max · {draft.ageMax}</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={18}
                    maximumValue={50}
                    step={1}
                    value={draft.ageMax}
                    minimumTrackTintColor={PURPLE}
                    maximumTrackTintColor="#e0e0e0"
                    thumbTintColor={PURPLE}
                    onValueChange={(v) => {
                      const n = Math.round(v);
                      setDraft((d) => {
                        let ageMax = Math.max(18, Math.min(50, n));
                        let ageMin = d.ageMin;
                        if (ageMax < ageMin) ageMin = ageMax;
                        return { ...d, ageMin, ageMax };
                      });
                    }}
                  />
                </View>
              </View>

              <View style={styles.toggleBlock}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>4 ★ & above</Text>
                  <Text style={styles.toggleSub}>Show only highly rated receivers</Text>
                </View>
                <Switch
                  value={draft.rating4Plus}
                  onValueChange={(v) => setDraft((d) => ({ ...d, rating4Plus: v }))}
                  trackColor={{ false: '#ddd', true: '#d4b8ff' }}
                  thumbColor={draft.rating4Plus ? PURPLE : '#f4f4f5'}
                />
              </View>

              <View style={styles.toggleBlock}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Online only</Text>
                  <Text style={styles.toggleSub}>Show only available receivers</Text>
                </View>
                <Switch
                  value={draft.onlineOnly}
                  onValueChange={(v) => setDraft((d) => ({ ...d, onlineOnly: v }))}
                  trackColor={{ false: '#ddd', true: '#d4b8ff' }}
                  thumbColor={draft.onlineOnly ? PURPLE : '#f4f4f5'}
                />
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.9}>
                <Text style={styles.resetTxt}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={onApply} activeOpacity={0.9}>
                <Text style={styles.applyTxt}>Apply</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
  },
  sheetInner: { paddingTop: 8 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  closeHit: { padding: 8, width: 44 },
  closeX: { fontSize: 18, color: '#333', fontWeight: '700' },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: '#111' },
  scroll: { maxHeight: '72%' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  secLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111',
    marginBottom: 10,
    marginTop: 4,
  },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  pillOn: { backgroundColor: PURPLE, borderColor: PURPLE },
  pillTxt: { fontSize: 13, fontWeight: '700', color: '#444' },
  pillTxtOn: { color: '#fff' },
  counter: { fontSize: 12, color: '#888', marginTop: 8, marginBottom: 8, fontWeight: '600' },
  ageHint: {
    fontSize: 12,
    color: '#777',
    marginBottom: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  ageBlock: { marginBottom: 8 },
  sliderRow: { marginBottom: 16 },
  sliderLbl: { fontSize: 13, fontWeight: '800', color: '#333', marginBottom: 6 },
  slider: { width: '100%', height: 40 },
  toggleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 12,
  },
  toggleTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  toggleSub: { fontSize: 12, color: '#888', marginTop: 4, lineHeight: 17 },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f3f3f3',
    alignItems: 'center',
  },
  resetTxt: { fontSize: 16, fontWeight: '800', color: '#444' },
  applyBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: 'center',
  },
  applyTxt: { fontSize: 16, fontWeight: '900', color: '#fff' },
});
