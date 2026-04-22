"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_WALLET_PACKAGE_KEYS = void 0;
exports.packageKey = packageKey;
exports.assertAllowedWalletPackage = assertAllowedWalletPackage;
exports.walletCreditForPackage = walletCreditForPackage;
/** Allowed wallet recharge packages — must match `frontend/constants/walletPackages.ts`. */
exports.ALLOWED_WALLET_PACKAGE_KEYS = new Set([
    '50-5',
    '50-15',
    '140-20',
    '200-25',
    '300-35',
    '500-35',
    '900-35',
    '1900-40',
    '9800-40',
    '15000-45',
]);
function packageKey(payAmount, bonusPercent) {
    return `${Math.round(payAmount)}-${Math.round(bonusPercent)}`;
}
function assertAllowedWalletPackage(payAmount, bonusPercent) {
    const key = packageKey(payAmount, bonusPercent);
    return exports.ALLOWED_WALLET_PACKAGE_KEYS.has(key) ? null : 'Invalid wallet package';
}
function walletCreditForPackage(payAmount, bonusPercent) {
    return Math.round(payAmount * (1 + bonusPercent / 100) * 100) / 100;
}
