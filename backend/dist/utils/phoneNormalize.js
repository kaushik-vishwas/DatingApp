"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeIndianMobilePhone = normalizeIndianMobilePhone;
exports.phoneLookupVariants = phoneLookupVariants;
/** Canonical 10-digit Indian mobile (6–9 prefix) for DB lookup and storage. */
function normalizeIndianMobilePhone(input) {
    const d = String(input).trim().replace(/\D/g, '');
    if (!d)
        return '';
    if (d.length <= 10)
        return d;
    return d.slice(-10);
}
/** Values that may exist in Mongo from older clients (+91 / 91 prefixes). */
function phoneLookupVariants(input) {
    const raw = String(input).trim();
    const ten = normalizeIndianMobilePhone(raw);
    if (!ten)
        return [];
    return [...new Set([raw, ten, `91${ten}`, `+91${ten}`])];
}
