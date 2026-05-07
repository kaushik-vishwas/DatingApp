import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PURPLE = '#7b2cff';

type Props = {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  minSelection?: number;
};

export function ToggleGroup({
  label,
  options,
  selected,
  onChange,
}: Props): React.JSX.Element {
  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.row}>
        {options.map((opt) => {
          const active = selected.includes(opt);
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
