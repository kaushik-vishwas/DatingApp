import Constants from 'expo-constants';

export type CloudinaryResourceType = 'image' | 'raw' | 'video' | 'auto';

export type UploadToCloudinaryOptions = {
  mimeType?: string;
  resourceType?: CloudinaryResourceType;
  fileName?: string;
};

export type CloudinaryUploadResult = {
  secure_url: string;
  public_id?: string;
};

function getCloudinaryConfig(): { cloudName: string; uploadPreset: string } {
  const extra = (Constants as any)?.expoConfig?.extra ?? (Constants as any)?.manifest?.extra ?? {};
  const cloudName = String(
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? extra.cloudinaryCloudName ?? ''
  ).trim();
  const uploadPreset = String(
    process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? extra.cloudinaryUploadPreset ?? ''
  ).trim();
  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Add EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET to frontend/.env, then restart Expo.'
    );
  }
  return { cloudName, uploadPreset };
}

/** Infer Cloudinary resource type from MIME (images vs raw docs vs auto). */
export function inferResourceType(mime: string): CloudinaryResourceType {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'video';
  if (m === 'application/pdf' || m.includes('pdf')) return 'raw';
  return 'auto';
}

export function inferMimeFromLocalRecording(uri: string): string {
  const lower = uri.split('?')[0].toLowerCase();
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4') || lower.endsWith('.aac')) return 'audio/mp4';
  if (lower.endsWith('.caf')) return 'audio/x-caf';
  if (lower.endsWith('.3gp') || lower.endsWith('.amr')) return 'audio/amr';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'audio/mp4';
}

/**
 * Unsigned upload to Cloudinary (preset must allow unsigned uploads in the dashboard).
 * Uses only cloud name + upload preset — never API key/secret on the client.
 *
 * @param fileUri Local `file://` or content URI from ImagePicker / DocumentPicker
 */
export async function uploadToCloudinary(
  fileUri: string,
  options: UploadToCloudinaryOptions = {}
): Promise<CloudinaryUploadResult> {
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  const resourceType =
    options.resourceType ?? inferResourceType(options.mimeType ?? 'image/jpeg');
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  const name =
    options.fileName?.trim() ||
    fileUri.split('/').pop()?.split('?')[0] ||
    (resourceType === 'raw' ? 'document.pdf' : 'upload.jpg');

  const mime =
    options.mimeType ??
    (resourceType === 'raw'
      ? 'application/octet-stream'
      : resourceType === 'video'
        ? 'audio/mp4'
        : 'image/jpeg');

  const form = new FormData();
  form.append('upload_preset', uploadPreset);
  form.append(
    'file',
    { uri: fileUri, type: mime, name } as unknown as Parameters<FormData['append']>[1]
  );

  const res = await fetch(endpoint, {
    method: 'POST',
    body: form,
  });

  const json = (await res.json()) as {
    secure_url?: string;
    public_id?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg = json?.error?.message || res.statusText || 'Upload failed';
    throw new Error(msg);
  }

  if (!json.secure_url) {
    throw new Error('Cloudinary response missing secure_url');
  }

  return { secure_url: json.secure_url, public_id: json.public_id };
}
