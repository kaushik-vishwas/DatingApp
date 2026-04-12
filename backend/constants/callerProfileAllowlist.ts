/**
 * Caller interests & languages accepted by PATCH /profile/caller.
 * Keep aligned with `frontend/constants/userOnboarding.ts`.
 */
export const CALLER_INTEREST_ALLOWLIST = new Set<string>([
  'Confidence',
  'Lifestyle',
  'Career',
  'Personal',
  'Relationships',
  'Marriage',
  'Education',
  'Art',
  'Music',
  'Sports',
  'Travel',
  'Movies',
  'Reading',
  'Food',
  'Fitness',
  'Technology',
  'Fashion',
  'Dancing',
]);

export const CALLER_LANGUAGE_ALLOWLIST = new Set<string>([
  'Telugu',
  'Kannada',
  'Tamil',
  'Hindi',
  'English',
  'Malayalam',
  'Marathi',
]);
