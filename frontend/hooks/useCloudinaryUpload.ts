import { useCallback, useState } from 'react';

import {
  type CloudinaryUploadResult,
  type UploadToCloudinaryOptions,
  uploadToCloudinary,
} from '../lib/cloudinary';

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export type UseUploadToCloudinaryResult = {
  status: UploadStatus;
  error: string | null;
  upload: (fileUri: string, options?: UploadToCloudinaryOptions) => Promise<CloudinaryUploadResult>;
  reset: () => void;
};

/**
 * Wraps {@link uploadToCloudinary} with loading / error state for UI.
 */
export function useUploadToCloudinary(): UseUploadToCloudinaryResult {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  const upload = useCallback(
    async (fileUri: string, options?: UploadToCloudinaryOptions) => {
      setStatus('uploading');
      setError(null);
      try {
        const result = await uploadToCloudinary(fileUri, options);
        setStatus('success');
        return result;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        setError(msg);
        setStatus('error');
        throw e;
      }
    },
    []
  );

  return { status, error, upload, reset };
}
