"use strict";
/**
 * Birth dates are exchanged as `YYYY-MM-DD` (calendar date, no time zone suffix).
 * Stored in Mongo as UTC midnight for that calendar date; age uses UTC calendar rules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDateOnlyToUtcMidnight = parseDateOnlyToUtcMidnight;
exports.calculateAgeFromBirthDateUtc = calculateAgeFromBirthDateUtc;
exports.validateBirthDateForAccount = validateBirthDateForAccount;
exports.dateOnlyIsoFromUtcDate = dateOnlyIsoFromUtcDate;
function parseDateOnlyToUtcMidnight(dateStr) {
    if (typeof dateStr !== 'string')
        return null;
    const s = dateStr.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
        return null;
    const [ys, ms, ds] = s.split('-');
    const y = Number(ys);
    const m = Number(ms);
    const d = Number(ds);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
        return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
        return null;
    return dt;
}
function calculateAgeFromBirthDateUtc(dob, now = new Date()) {
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
        age -= 1;
    }
    return age;
}
/** Human-readable validation for registration / profile (18–120 inclusive). */
function validateBirthDateForAccount(dob, now = new Date()) {
    if (dob.getTime() > now.getTime())
        return 'Date of birth cannot be in the future';
    const age = calculateAgeFromBirthDateUtc(dob, now);
    if (age < 18)
        return 'You must be at least 18 years old';
    if (age > 120)
        return 'Enter a valid date of birth';
    return null;
}
function dateOnlyIsoFromUtcDate(d) {
    if (!d || !(d instanceof Date) || Number.isNaN(d.getTime()))
        return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
