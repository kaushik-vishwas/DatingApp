import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getLastCallDebugPreview,
  getLastCallIssueCount,
  hasLastCallDiagnostics,
  hydrateCallDiagnosticsFromStorage,
  subscribeCallDiagnostics,
} from '../../utils/callDiagnostics';

type Props = {
  onPress: () => void;
  bottomOffset?: number;
};

/**
 * Temporary debug FAB — comment out on home screens when GSM hold is stable.
 */
export function LastCallDebugFab({ onPress, bottomOffset = 88 }: Props): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState('');
  const [issueCount, setIssueCount] = useState(0);
  const [visible, setVisible] = useState(false);

  const refresh = useCallback(() => {
    setVisible(hasLastCallDiagnostics());
    setIssueCount(getLastCallIssueCount());
    setPreview(getLastCallDebugPreview());
  }, []);

  useEffect(() => {
    void hydrateCallDiagnosticsFromStorage().then(refresh);
    return subscribeCallDiagnostics(refresh);
  }, [refresh]);

  if (!visible) {
    return (
      <TouchableOpacity
        style={[
          styles.fab,
          {
            bottom: insets.bottom + bottomOffset,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.9}
        accessibilityLabel="Open last call debug logs"
      >
        <Text style={styles.fabTitle}>Call debug</Text>
        <Text style={styles.fabSub}>No logs yet</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          bottom: insets.bottom + bottomOffset,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityLabel="Open last call debug logs"
    >
      <View style={styles.fabHeader}>
        <Text style={styles.fabTitle}>Last call debug</Text>
        {issueCount > 0 ? (
          <View style={styles.issueBadge}>
            <Text style={styles.issueBadgeText}>{issueCount > 9 ? '9+' : String(issueCount)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.fabPreview} numberOfLines={4}>
        {preview}
      </Text>
      <Text style={styles.fabTap}>Tap for full log →</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#b91c1c',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#fecaca',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
    zIndex: 999,
  },
  fabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  fabTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  issueBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  issueBadgeText: {
    color: '#b91c1c',
    fontSize: 10,
    fontWeight: '800',
  },
  fabSub: {
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '600',
  },
  fabPreview: {
    color: '#fee2e2',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
  fabTap: {
    marginTop: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
