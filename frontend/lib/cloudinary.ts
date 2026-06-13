import Constants from 'expo-constants';

export type CloudinaryResourceType = 'image' | 'raw' | 'video' | 'auto';

export type UploadToCloudinaryOptions = {
  mimeType?: string;
  resourceType?: CloudinaryResourceType;
  fileName?: string;
  /** Live upload trace for on-screen debugging. */
  onDebug?: (entry: CloudinaryUploadDebugEntry) => void;
};

export type CloudinaryUploadResult = {
  secure_url: string;
  public_id?: string;
};

export type CloudinaryUploadDebugEntry = {
  at: string;
  step: string;
  detail?: string;
  httpStatus?: number;
  cloudName?: string;
  uploadPreset?: string;
  endpoint?: string;
  resourceType?: string;
  mimeType?: string;
  fileUri?: string;
};

export type CloudinaryConfigDebug = {
  cloudName: string;
  uploadPreset: string;
  cloudNameSource: string;
  uploadPresetSource: string;
  envCloudName: string;
  envUploadPreset: string;
  extraCloudName: string;
  extraUploadPreset: string;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readExtra(): Record<string, unknown> {
  const c = Constants as {
    expoConfig?: { extra?: Record<string, unknown> };
    manifest?: { extra?: Record<string, unknown> };
  };
  return c.expoConfig?.extra ?? c.manifest?.extra ?? {};
}

/** Which config source is active — helps spot .env vs app.json mismatches. */
export function getCloudinaryConfigDebug(): CloudinaryConfigDebug {
  const extra = readExtra();
  const envCloudName = String(process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '').trim();
  const envUploadPreset = String(process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '').trim();
  const extraCloudName = String(extra.cloudinaryCloudName ?? '').trim();
  const extraUploadPreset = String(extra.cloudinaryUploadPreset ?? '').trim();

  const cloudName = envCloudName || extraCloudName;
  const uploadPreset = envUploadPreset || extraUploadPreset;

  return {
    cloudName,
    uploadPreset,
    cloudNameSource: envCloudName ? 'EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME' : extraCloudName ? 'app.json extra' : 'missing',
    uploadPresetSource: envUploadPreset
      ? 'EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET'
      : extraUploadPreset
        ? 'app.json extra'
        : 'missing',
    envCloudName,
    envUploadPreset,
    extraCloudName,
    extraUploadPreset,
  };
}

function getCloudinaryConfig(): { cloudName: string; uploadPreset: string } {
  const debug = getCloudinaryConfigDebug();
  if (!debug.cloudName || !debug.uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in frontend/.env (then restart Expo with -c).'
    );
  }
  return { cloudName: debug.cloudName, uploadPreset: debug.uploadPreset };
}

function emitDebug(
  onDebug: UploadToCloudinaryOptions['onDebug'],
  entry: Omit<CloudinaryUploadDebugEntry, 'at'>
): void {
  onDebug?.({ at: new Date().toISOString(), ...entry });
}

function parseCloudinaryErrorBody(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const obj = body as { error?: { message?: string } | string; message?: string };
  if (typeof obj.error === 'string') return obj.error;
  if (obj.error && typeof obj.error === 'object' && typeof obj.error.message === 'string') {
    return obj.error.message;
  }
  if (typeof obj.message === 'string') return obj.message;
  try {
    return JSON.stringify(body).slice(0, 280);
  } catch {
    return '';
  }
}

function formatFetchUploadError(e: unknown, httpStatus?: number): string {
  if (httpStatus) {
    return `Cloudinary HTTP ${httpStatus}`;
  }
  if (e instanceof TypeError && /network request failed/i.test(e.message)) {
    return 'Network request failed — check internet, VPN, or try another Wi‑Fi network.';
  }
  if (e instanceof Error && e.message) return e.message;
  return 'Upload failed';
}

/** Infer Cloudinary resource type from MIME (images vs raw docs vs auto). */
export function inferResourceType(mime: string): CloudinaryResourceType {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'auto';
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
 * Uses fetch + FormData (more reliable than axios on React Native).
 */
export async function uploadToCloudinary(
  fileUri: string,
  options: UploadToCloudinaryOptions = {}
): Promise<CloudinaryUploadResult> {
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  const configDebug = getCloudinaryConfigDebug();
  const resourceType =
    options.resourceType ?? inferResourceType(options.mimeType ?? 'image/jpeg');
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  const name =
    options.fileName?.trim() ||
    fileUri.split('/').pop()?.split('?')[0] ||
    (resourceType === 'raw' ? 'document.pdf' : 'upload.m4a');

  const mime =
    options.mimeType ??
    (resourceType === 'raw'
      ? 'application/octet-stream'
      : resourceType === 'video' || resourceType === 'auto'
        ? 'audio/mp4'
        : 'image/jpeg');

  emitDebug(options.onDebug, {
    step: 'config',
    cloudName,
    uploadPreset,
    endpoint,
    resourceType,
    mimeType: mime,
    fileUri: fileUri.slice(0, 80),
    detail: `preset via ${configDebug.uploadPresetSource}`,
  });

  let lastError: unknown = null;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    emitDebug(options.onDebug, {
      step: 'upload_attempt',
      detail: `attempt ${attempt}/3`,
      endpoint,
      resourceType,
    });

    try {
      const form = new FormData();
      form.append('upload_preset', uploadPreset);
      form.append(
        'file',
        { uri: fileUri, type: mime, name } as unknown as Parameters<FormData['append']>[1]
      );

      const response = await fetch(endpoint, {
        method: 'POST',
        body: form,
        headers: { Accept: 'application/json' },
      });

      lastStatus = response.status;
      let json: {
        secure_url?: string;
        public_id?: string;
        error?: { message?: string } | string;
        message?: string;
      };

      try {
        json = (await response.json()) as typeof json;
      } catch {
        throw new Error(`Cloudinary returned non-JSON (HTTP ${response.status})`);
      }

      if (!response.ok) {
        const apiMsg = parseCloudinaryErrorBody(json);
        emitDebug(options.onDebug, {
          step: 'upload_http_error',
          httpStatus: response.status,
          detail: apiMsg || `HTTP ${response.status}`,
          endpoint,
        });
        throw new Error(apiMsg || `Cloudinary HTTP ${response.status}`);
      }

      if (!json?.secure_url) {
        const msg = parseCloudinaryErrorBody(json) || 'Cloudinary response missing secure_url';
        throw new Error(msg);
      }

      emitDebug(options.onDebug, {
        step: 'upload_ok',
        detail: json.public_id ? `public_id=${json.public_id}` : undefined,
        httpStatus: response.status,
      });

      return { secure_url: json.secure_url, public_id: json.public_id };
    } catch (e) {
      lastError = e;
      emitDebug(options.onDebug, {
        step: 'upload_failed',
        httpStatus: lastStatus,
        detail: e instanceof Error ? e.message : String(e),
        endpoint,
      });
      if (attempt < 3) {
        await wait(600 * attempt);
        continue;
      }
    }
  }

  const msg =
    lastError instanceof Error
      ? lastError.message
      : formatFetchUploadError(lastError, lastStatus);
  throw new Error(msg);
}
