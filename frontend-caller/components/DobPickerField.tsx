import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatDateOnlyLocal, maxDobDateForMinAge, minDobDateForMaxAge } from '../utils/birthDateClient';

const PURPLE = '#7b2cff';

type Props = {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  /** Default shown in picker when `value` is null */
  fallbackDate?: Date;
};

// Helper function to format date as DD-MM-YYYY for display
function formatDisplayDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export default function DobPickerField({ label, value, onChange, fallbackDate }: Props): React.JSX.Element {
  const [show, setShow] = useState(false);

  const maximumDate = useMemo(() => maxDobDateForMinAge(18), []);
  const minimumDate = useMemo(() => minDobDateForMaxAge(120), []);

  const displayDate = value ?? fallbackDate ?? maximumDate;

  // Display format: DD-MM-YYYY for user, API format: YYYY-MM-DD for backend
  const summary = value ? formatDisplayDate(value) : 'Tap to choose';

  const open = () => {
    setShow(true);
  };

  const onPick = (picked: Date | undefined) => {
    if (picked) onChange(picked);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.box} onPress={open} activeOpacity={0.85}>
        <Text style={[styles.value, !value && styles.placeholder]}>{summary}</Text>
        <Text style={styles.chev}>▼</Text>
      </TouchableOpacity>

      {show ? (
        <DateTimePicker
          value={displayDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(ev, date) => {
            if (Platform.OS === 'android') {
              setShow(false);
              if (ev.type === 'set' && date) onPick(date);
            } else if (date) {
              onPick(date);
            }
          }}
        />
      ) : null}

      {show && Platform.OS === 'ios' ? (
        <TouchableOpacity style={styles.done} onPress={() => setShow(false)} activeOpacity={0.9}>
          <Text style={styles.doneTxt}>Done</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  value: { fontSize: 15, fontWeight: '600', color: '#111', flex: 1 },
  placeholder: { color: '#999', fontWeight: '500' },
  chev: { fontSize: 12, color: '#888', marginLeft: 8 },
  done: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: PURPLE,
    borderRadius: 10,
  },
  doneTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});