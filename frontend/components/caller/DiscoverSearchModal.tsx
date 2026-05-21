import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const PURPLE = '#7b2cff';

type Props = {
  visible: boolean;
  draft: string;
  setDraft: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
};

export default function DiscoverSearchModal({
  visible,
  draft,
  setDraft,
  onClose,
  onApply,
}: Props): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']} style={styles.sheetInner}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity style={styles.closeHit} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>Search</Text>
              <TouchableOpacity
                style={styles.clearHit}
                onPress={() => setDraft('')}
                activeOpacity={0.85}
              >
                <Text style={styles.clearTxt}>Clear</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputRow}>
              <Ionicons name="search-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Search by name or interest…"
                placeholderTextColor="#999"
                value={draft}
                onChangeText={setDraft}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={onApply}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {draft.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setDraft('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="close-circle" size={20} color="#bbb" />
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity style={styles.applyBtn} onPress={onApply} activeOpacity={0.9}>
              <Text style={styles.applyTxt}>Search</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
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
  },
  sheetInner: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  closeHit: { padding: 8, width: 44 },
  closeX: { fontSize: 18, color: '#333', fontWeight: '700' },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: '#111' },
  clearHit: { padding: 8 },
  clearTxt: { fontSize: 14, fontWeight: '700', color: PURPLE },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    backgroundColor: '#fafafa',
    gap: 8,
  },
  inputIcon: { marginRight: 2 },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    paddingVertical: 4,
  },
  applyBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
