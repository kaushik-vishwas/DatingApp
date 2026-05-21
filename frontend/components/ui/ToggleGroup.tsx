import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PURPLE = '#7b2cff';

type Props = {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  minSelection?: number;
  maxSelection?: number;
};

export function ToggleGroup({
  label,
  options,
  selected,
  onChange,
  maxSelection,
}: Props): React.JSX.Element {
  const visibleSelected = selected.filter((item) => options.includes(item));

  const toggle = (item: string) => {
    if (visibleSelected.includes(item)) {
      onChange(visibleSelected.filter((s) => s !== item));
      return;
    }
    if (maxSelection != null && visibleSelected.length >= maxSelection) {
      Alert.alert('Maximum reached', `You can select up to ${maxSelection} options.`);
      return;
    }
    onChange([...visibleSelected, item]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.row}>
        {options.map((opt) => {
          const active = visibleSelected.includes(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => toggle(opt)}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  groupLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    borderColor: PURPLE,
    backgroundColor: 'rgba(123,44,255,0.08)',
  },
  chipText: {
    fontSize: 12,
    color: '#444',
    fontWeight: '700',
  },
  chipTextActive: {
    color: PURPLE,
  },
});
