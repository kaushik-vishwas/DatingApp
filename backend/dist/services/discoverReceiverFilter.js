"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDiscoverReceiverFilter = buildDiscoverReceiverFilter;
const callerProfileAllowlist_1 = require("../constants/callerProfileAllowlist");
/**
 * Example (combined filters = AND):
 * `GET /discover/receivers?gender=Female&minAge=22&maxAge=35&langs=Hindi,English&limit=50`
 * Response: `{ "receivers": [ { "_id": "...", "name": "...", "age": 28, "gender": "female", ... } ] }`
 * Omit `gender`, `minAge`/`maxAge` to skip those filters.
 * Always excludes suspended/rejected; includes approved and in-progress profiles so offline receivers stay visible on discover.
 */
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const SLIDER_AGE_MIN = 18;
const SLIDER_AGE_MAX = 50;
/**
 * Builds a Mongoose filter with AND semantics across all active clauses.
 * Age range is only applied when both bounds are valid integers in [18, 50] and min <= max;
 * then `age` must exist and lie in range (no matches for null/missing age).
 */
function buildDiscoverReceiverFilter(input) {
    const parts = [
        {
            suspended: { $ne: true },
            accountStatus: { $in: ['approved', 'pending_profile'] },
            isVerified: true,
        },
    ];
    const langsList = input.langsRaw
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => callerProfileAllowlist_1.CALLER_LANGUAGE_ALLOWLIST.has(s))
        .filter((s, i, a) => a.indexOf(s) === i)
        .slice(0, 5);
    if (langsList.length > 0) {
        parts.push({ languages: { $in: langsList } });
    }
    else if (input.language.trim()) {
        parts.push({ languages: input.language.trim() });
    }
    const genderQ = input.gender.trim().toLowerCase();
    if (genderQ === 'male' || genderQ === 'female' || genderQ === 'other') {
        parts.push({ gender: new RegExp(`^${escapeRegex(genderQ)}$`, 'i') });
    }
    const { minAge, maxAge } = input;
    const fullSpan = minAge === SLIDER_AGE_MIN && maxAge === SLIDER_AGE_MAX;
    const ageFilterActive = !fullSpan &&
        Number.isFinite(minAge) &&
        Number.isFinite(maxAge) &&
        minAge >= SLIDER_AGE_MIN &&
        maxAge <= SLIDER_AGE_MAX &&
        minAge <= maxAge;
    if (ageFilterActive) {
        parts.push({ age: { $gte: minAge, $lte: maxAge } });
    }
    const q = input.q.trim();
    if (q) {
        const rx = new RegExp(escapeRegex(q), 'i');
        parts.push({
            $or: [{ name: rx }, { interests: rx }, { languages: rx }],
        });
    }
    return parts.length === 1 ? parts[0] : { $and: parts };
}
