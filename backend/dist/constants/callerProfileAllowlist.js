"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CALLER_LANGUAGE_ALLOWLIST = exports.CALLER_INTEREST_ALLOWLIST = void 0;
/**
 * Caller interests & languages accepted by PATCH /profile/caller.
 * Keep aligned with `frontend/constants/userOnboarding.ts`.
 */
exports.CALLER_INTEREST_ALLOWLIST = new Set([
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
exports.CALLER_LANGUAGE_ALLOWLIST = new Set([
    'Telugu',
    'Kannada',
    'Tamil',
    'Hindi',
    'English',
    'Malayalam',
    'Marathi',
]);
