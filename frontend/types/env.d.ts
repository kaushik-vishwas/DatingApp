declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?: string;
    EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET?: string;
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_API_DISABLE_PACKAGER_HOST?: string;
  }
}
