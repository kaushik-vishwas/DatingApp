import axios, { isAxiosError } from 'axios';
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const form = new FormData();
      form.append('upload_preset', uploadPreset);
      form.append(
        'file',
        { uri: fileUri, type: mime, name } as unknown as Parameters<FormData['append']>[1]
      );

      /**
       * Use axios (XMLHttpRequest on RN) instead of fetch — many Android release builds fail
       * multipart uploads to api.cloudinary.com with fetch("Network request failed") while XHR works.
       * Do not set Content-Type manually (axios sets multipart boundary).
       */
      const res = await axios.post<{
        secure_url?: string;
        public_id?: string;
        error?: { message?: string };
      }>(endpoint, form, {
        timeout: 120_000,
        headers: { Accept: 'application/json' },
      });

      const json = res.data;
      if (!json?.secure_url) {
        const msg = json?.error?.message || 'Cloudinary response missing secure_url';
        throw new Error(msg);
      }

      return { secure_url: json.secure_url, public_id: json.public_id };
    } catch (e) {
      lastError = e;
      if (isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        const body = e.response.data as { error?: { message?: string } };
        const apiMsg = body.error?.message;
        if (apiMsg) {
          lastError = new Error(apiMsg);
        }
      }
      if (attempt < 3) {
        await wait(500 * attempt);
        continue;
      }
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('Upload failed');
}
