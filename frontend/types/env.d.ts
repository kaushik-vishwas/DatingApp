declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?: string;
    EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET?: string;
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_API_DISABLE_PACKAGER_HOST?: string;
    /** Local backend port when using packager LAN IP in dev (default 5000). */
    EXPO_PUBLIC_API_LOCAL_PORT?: string;
    /** Set to 1 only for Samsung notification debug APK builds */
    EXPO_PUBLIC_INCOMING_CALL_NOTIF_DEBUG?: string;
    EXPO_PUBLIC_INCOMING_CALL_NOTIF_LOG?: string;
    /** true/1 = block screenshots & screen recording on active call screen; false/0 = allow */
    EXPO_PUBLIC_CALL_SCREEN_CAPTURE_PROTECTION?: string;
  }
}
