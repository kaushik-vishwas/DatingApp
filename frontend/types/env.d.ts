declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?: string;
    EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET?: string;
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_API_DISABLE_PACKAGER_HOST?: string;
    /** Set to 1 only for Samsung notification debug APK builds */
    EXPO_PUBLIC_INCOMING_CALL_NOTIF_DEBUG?: string;
    EXPO_PUBLIC_INCOMING_CALL_NOTIF_LOG?: string;
  }
}
