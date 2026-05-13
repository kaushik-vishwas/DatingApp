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
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dfeeqvx3v';
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'dating_app_preset';
  
  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to admin-panel/.env'
    );
  }
  return { cloudName, uploadPreset };
}

export function inferResourceType(mime: string): CloudinaryResourceType {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'video';
  if (m === 'application/pdf' || m.includes('pdf')) return 'raw';
  return 'auto';
}

/**
 * Upload file to Cloudinary from admin panel
 */
export async function uploadToCloudinary(
  file: File,
  options: UploadToCloudinaryOptions = {}
): Promise<CloudinaryUploadResult> {
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  
  // Determine mime type
  const mimeType = options.mimeType || file.type || 'image/jpeg';
  const resourceType = options.resourceType || inferResourceType(mimeType);
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  const formData = new FormData();
  formData.append('upload_preset', uploadPreset);
  formData.append('file', file);

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Upload failed');
  }

  const data = await response.json();
  
  if (!data.secure_url) {
    throw new Error('Cloudinary response missing secure_url');
  }

  return { secure_url: data.secure_url, public_id: data.public_id };
}