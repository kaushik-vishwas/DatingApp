import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getCloudinaryConfigDebug,
  type CloudinaryUploadDebugEntry,
} from '../lib/cloudinary';
import { getResolvedApiBaseUrl } from '../services/api';

import type { VoiceVerificationResult } from '../types/api';

type Props = {
  entries: CloudinaryUploadDebugEntry[];
  lastError?: string | null;
  verification?: VoiceVerificationResult | null;
};

export default function VoiceUploadDebugPanel({
  entries,
  lastError,
  verification,
}: Props): React.JSX.Element {
  const cfg = getCloudinaryConfigDebug();
  const presetMismatch =
    cfg.envUploadPreset &&
    cfg.extraUploadPreset &&
    cfg.envUploadPreset !== cfg.extraUploadPreset;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Upload debug</Text>
      <Text style={styles.row}>
        <Text style={styles.label}>API: </Text>
        {getResolvedApiBaseUrl()}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Cloud: </Text>
        {cfg.cloudName || '(missing)'} ({cfg.cloudNameSource})
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Preset: </Text>
        {cfg.uploadPreset || '(missing)'} ({cfg.uploadPresetSource})
      </Text>
      {presetMismatch ? (
        <Text style={styles.warn}>
          Preset mismatch — .env uses “{cfg.envUploadPreset}” but app.json extra has “
          {cfg.extraUploadPreset}”. Active: {cfg.uploadPreset}
        </Text>
      ) : null}
      {!cfg.cloudName || !cfg.uploadPreset ? (
        <Text style={styles.warn}>
          Cloudinary not fully configured. Restart Expo with: npx expo start -c
        </Text>
      ) : null}
      {lastError ? (
        <Text style={styles.error}>
          <Text style={styles.label}>Upload error: </Text>
          {lastError}
        </Text>
      ) : null}
      {verification ? (
        <View style={styles.verifyBlock}>
          <Text style={styles.verifyTitle}>Last verification (API)</Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Approved: </Text>
            {verification.approved ? 'yes' : 'no'}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Profile gender: </Text>
            {verification.profileGender ?? '?'}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Predicted: </Text>
            {verification.predictedGender} ({Math.round(verification.confidence * 100)}%)
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Threshold: </Text>
            {Math.round(verification.threshold * 100)}%
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Kind: </Text>
            {verification.failureKind ?? (verification.approved ? 'passed' : 'failed')}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Model: </Text>
            {verification.model}
          </Text>
          {verification.reason ? (
            <Text style={styles.warn}>{verification.reason}</Text>
          ) : null}
        </View>
      ) : null}
      {entries.length > 0 ? (
        <ScrollView style={styles.log} nestedScrollEnabled>
          {[...entries].reverse().slice(0, 12).map((e, i) => (
            <Text key={`${e.at}-${i}`} style={styles.logLine}>
              [{e.step}]
              {e.httpStatus ? ` ${e.httpStatus}` : ''}
              {e.detail ? ` — ${e.detail}` : ''}
            </Text>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.hint}>Record voice to see upload steps here.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1e1b4b',
    borderWidth: 1,
    borderColor: '#4338ca',
  },
  title: { color: '#c4b5fd', fontSize: 12, fontWeight: '800', marginBottom: 8 },
  row: { color: '#e9d5ff', fontSize: 11, marginBottom: 4, fontFamily: 'monospace' },
  label: { color: '#a78bfa', fontWeight: '700' },
  warn: {
    color: '#fde68a',
    fontSize: 11,
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 16,
  },
  error: {
    color: '#fca5a5',
    fontSize: 11,
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 16,
  },
  log: { maxHeight: 120, marginTop: 8 },
  logLine: {
    color: '#ddd6fe',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 3,
  },
  hint: { color: '#94a3b8', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  verifyBlock: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#4338ca',
  },
  verifyTitle: { color: '#fcd34d', fontSize: 11, fontWeight: '800', marginBottom: 4 },
});
