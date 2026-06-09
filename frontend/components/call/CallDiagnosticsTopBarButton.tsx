import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  getLastCallIssueCount,
  hasLastCallDiagnostics,
  hydrateCallDiagnosticsFromStorage,
  subscribeCallDiagnostics,
} from '../../utils/callDiagnostics';

type Props = {
  onPress: () => void;
};

export function CallDiagnosticsTopBarButton({ onPress }: Props): React.JSX.Element {
  const [issueCount, setIssueCount] = useState(0);
  const [hasLogs, setHasLogs] = useState(false);

  const refresh = useCallback(() => {
    setIssueCount(getLastCallIssueCount());
    setHasLogs(hasLastCallDiagnostics());
  }, []);

  useEffect(() => {
    void hydrateCallDiagnosticsFromStorage().then(refresh);
    return subscribeCallDiagnostics(refresh);
  }, [refresh]);

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel="Last call logs and issues"
      accessibilityRole="button"
    >
      <Ionicons name="document-text-outline" size={22} color="#6b21a8" />
      {issueCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{issueCount > 9 ? '9+' : String(issueCount)}</Text>
        </View>
      ) : hasLogs ? (
        <View style={styles.dot} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3e8ff',
    borderWidth: 1,
    borderColor: '#d8b4fe',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7c3aed',
    borderWidth: 1,
    borderColor: '#fff',
  },
});
