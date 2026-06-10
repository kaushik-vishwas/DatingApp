import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  getPresenceIssueCount,
  hasPresenceDiagnostics,
  hydratePresenceDiagnostics,
  subscribePresenceDiagnostics,
} from '../../utils/receiverPresenceDiagnostics';

type Props = {
  onPress: () => void;
};

export function PresenceDiagnosticsTopBarButton({ onPress }: Props): React.JSX.Element {
  const [issueCount, setIssueCount] = useState(0);
  const [hasLogs, setHasLogs] = useState(false);

  const refresh = useCallback(() => {
    setIssueCount(getPresenceIssueCount());
    setHasLogs(hasPresenceDiagnostics());
  }, []);

  useEffect(() => {
    void hydratePresenceDiagnostics().then(refresh);
    return subscribePresenceDiagnostics(refresh);
  }, [refresh]);

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel="Receiver presence logs"
      accessibilityRole="button"
    >
      <Ionicons name="radio-outline" size={20} color="#fff" />
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
    backgroundColor: '#dc2626',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#7f1d1d',
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
    backgroundColor: '#fecaca',
    borderWidth: 1,
    borderColor: '#fff',
  },
});
