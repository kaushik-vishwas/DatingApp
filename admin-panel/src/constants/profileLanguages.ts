/** Matches caller onboarding (`CALLER_LANGUAGE_OPTIONS`). */
export const CALLER_LANGUAGES = ['Telugu', 'Kannada', 'Tamil', 'Hindi', 'English', 'Malayalam', 'Marathi'] as const;

/** Matches receiver onboarding, which also includes Bengali. */
export const RECEIVER_LANGUAGES = [
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Kannada',
  'Bengali',
  'Marathi',
] as const;
