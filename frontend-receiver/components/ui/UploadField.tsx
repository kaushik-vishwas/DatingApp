import React from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const PURPLE = '#7b2cff';

type Props = {
  label: string;
  /** Local file URI after pick, or a stable preset id (e.g. preset:female:1). */
  uri: string | null;
  mimeType?: string | null;
  /** When `uri` is not a real image URL, pass bundled source for preview. */
  imageSource?: ImageSourcePropType | null;
  /** Shown for non-image files */
  displayName?: string | null;
  onPick: () => void;
  onClear?: () => void;
  hint?: string;
  loading?: boolean;
  imageShape?: 'circle' | 'rectangle';
};

export function UploadField({
  label,
  uri,
  mimeType,
  imageSource,
  displayName,
  onPick,
  onClear,
  hint,
  loading = false,
  imageShape = 'circle',
}: Props): React.JSX.Element {
  const isImageUri = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith('data:image/')) return true;
    if (
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('file://') ||
      normalized.startsWith('content://') ||
      normalized.startsWith('asset:/') ||
      normalized.startsWith('ph://') ||
      normalized.startsWith('blob:')
    ) {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)(\?.*)?$/.test(normalized);
  };
  const isImage = Boolean(
    uri &&
      (imageSource != null ||
        mimeType?.toLowerCase().startsWith('image/') ||
        isImageUri(uri)),
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.box}
        onPress={onPick}
        activeOpacity={0.85}
        disabled={loading}
      >
        {loading ? (
          <View style={styles.loadingInner}>
            <ActivityIndicator color={PURPLE} />
            <Text style={[styles.loadingText, { marginTop: 8 }]}>Uploading…</Text>
          </View>
        ) : uri ? (
          isImage ? (
            <View style={styles.imagePreviewWrap}>
              <Image
                source={imageSource ?? { uri }}
                style={imageShape === 'rectangle' ? styles.previewRect : styles.previewCircle}
              />
            </View>
          ) : (
            <View style={styles.docPreview}>
              <Text style={styles.docIcon}>📄</Text>
              <Text style={styles.docName} numberOfLines={2}>
                {displayName ?? 'Document'}
              </Text>
              <Text style={styles.docHint}>Preview not available for this file type</Text>
            </View>
          )
        ) : (
          <Text style={styles.placeholder}>Tap to choose file</Text>
        )}
      </TouchableOpacity>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {uri && onClear && !loading ? (
        <TouchableOpacity onPress={onClear}>
          <Text style={styles.clear}>Remove</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  box: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    borderStyle: 'dashed',
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#fafafa',
  },
  preview: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  imagePreviewWrap: {
    width: '100%',
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  previewCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    resizeMode: 'cover',
  },
  previewRect: {
    width: '100%',
    height: 180,
    borderRadius: 0,
    resizeMode: 'cover',
  },
  docPreview: {
    padding: 20,
    alignItems: 'center',
  },
  docIcon: { fontSize: 36, marginBottom: 8 },
  docName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  docHint: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    textAlign: 'center',
  },
  loadingInner: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: PURPLE,
    fontWeight: '700',
  },
  placeholder: {
    color: '#888',
    fontSize: 13,
    padding: 24,
  },
  hint: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
  },
  clear: {
    color: PURPLE,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
});
