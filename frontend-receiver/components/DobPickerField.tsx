import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState, useRef } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

import { maxDobDateForMinAge, minDobDateForMaxAge } from '../utils/birthDateClient';

const PURPLE = '#7b2cff';

type Props = {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  /** Default shown in picker when `value` is null */
  fallbackDate?: Date;
};

export default function DobPickerField({ label, value, onChange, fallbackDate }: Props): React.JSX.Element {
  const [showPicker, setShowPicker] = useState(false);
  const [manualInput, setManualInput] = useState<string>('');
  const [isManualMode, setIsManualMode] = useState<boolean>(false);
  const inputRef = useRef<TextInput>(null);

  const maximumDate = useMemo(() => maxDobDateForMinAge(18), []);
  const minimumDate = useMemo(() => minDobDateForMaxAge(120), []);

  const displayDate = value ?? fallbackDate ?? maximumDate;

  // Check if user is at least 18 years old
  const isAgeValid = (date: Date): boolean => {
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      age--;
    }
    return age >= 18;
  };

  // Check if date is valid (e.g., no Feb 30, no 95 as day, no 65 as month)
  const isValidDate = (year: number, month: number, day: number): boolean => {
    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day &&
      day >= 1 && day <= 31 &&
      month >= 1 && month <= 12 &&
      year >= 1900 && year <= new Date().getFullYear()
    );
  };

  // Format date as DD-MM-YYYY for display
  const formatDisplayDate = (date: Date | null): string => {
    if (!date) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Parse DD-MM-YYYY string to Date object
  const parseDateString = (dateStr: string): Date | null => {
    // Remove any non-digit characters
    const cleanStr = dateStr.replace(/[^\d]/g, '');
    
    if (cleanStr.length !== 8) return null;
    
    const day = parseInt(cleanStr.substring(0, 2), 10);
    const month = parseInt(cleanStr.substring(2, 4), 10);
    const year = parseInt(cleanStr.substring(4, 8), 10);
    
    // Check if the date components are valid
    if (!isValidDate(year, month, day)) {
      return null;
    }
    
    const date = new Date(year, month - 1, day);
    return date;
  };

  // Auto-format input as user types (DD-MM-YYYY)
  const handleManualInput = (text: string) => {
    // Remove non-digit characters
    let digits = text.replace(/[^\d]/g, '');
    
    // Format with dashes
    let formatted = '';
    if (digits.length > 0) {
      formatted += digits.substring(0, 2);
    }
    if (digits.length >= 3) {
      formatted += '-' + digits.substring(2, 4);
    }
    if (digits.length >= 5) {
      formatted += '-' + digits.substring(4, 8);
    }
    
    setManualInput(formatted);
    
    // Try to parse and update date when we have 8 digits
    if (digits.length === 8) {
      const parsedDate = parseDateString(digits);
      if (!parsedDate) {
        Alert.alert('Invalid Date', 'Please enter a valid date (DD-MM-YYYY). Example: 15-05-1995');
        setManualInput('');
        return;
      }
      if (!isAgeValid(parsedDate)) {
        Alert.alert('Age Restriction', 'You must be at least 18 years old to register.');
        setManualInput('');
        return;
      }
      onChange(parsedDate);
      setIsManualMode(false);
      setManualInput('');
    }
  };

  const openDatePicker = () => {
    setIsManualMode(false);
    setManualInput('');
    setShowPicker(true);
  };

  const handleFieldPress = () => {
    // Enter manual typing mode
    setIsManualMode(true);
    setManualInput(value ? formatDisplayDate(value) : '');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const onPick = (picked: Date | undefined) => {
    if (picked) {
      if (!isAgeValid(picked)) {
        Alert.alert('Age Restriction', 'You must be at least 18 years old to register.');
        setShowPicker(false);
        return;
      }
      onChange(picked);
      setManualInput('');
      setIsManualMode(false);
    }
  };

  const summary = value ? formatDisplayDate(value) : '';

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      
      {isManualMode ? (
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="DD-MM-YYYY"
          placeholderTextColor="#999"
          value={manualInput}
          onChangeText={handleManualInput}
          keyboardType="numeric"
          onBlur={() => {
            // Exit manual mode if input is empty or incomplete
            if (!manualInput || manualInput.length < 10) {
              setIsManualMode(false);
              setManualInput('');
            }
          }}
        />
      ) : (
        <TouchableOpacity style={styles.box} onPress={handleFieldPress} activeOpacity={0.85}>
          <Text style={[styles.value, !value && styles.placeholder]}>
            {summary || 'DD-MM-YYYY'}
          </Text>
          <TouchableOpacity onPress={openDatePicker} style={styles.calendarButton}>
            <Icon name="calendar" size={18} color="#999" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {showPicker ? (
        <DateTimePicker
          value={displayDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(ev, date) => {
            if (Platform.OS === 'android') {
              setShowPicker(false);
              if (ev.type === 'set' && date) onPick(date);
            } else if (date) {
              onPick(date);
            }
          }}
        />
      ) : null}

      {showPicker && Platform.OS === 'ios' ? (
        <TouchableOpacity style={styles.done} onPress={() => setShowPicker(false)} activeOpacity={0.9}>
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
    paddingVertical: 12,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '400',
    color: '#111',
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  value: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#111', 
    flex: 1 
  },
  placeholder: { 
    color: '#999', 
    fontWeight: '400' 
  },
  calendarButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  done: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: PURPLE,
    borderRadius: 10,
  },
  doneTxt: { 
    color: '#fff', 
    fontWeight: '800', 
    fontSize: 14 
  },
});