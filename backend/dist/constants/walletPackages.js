"use strict";
// Remove ALL static constants - they're not needed anymore
// Your backend should ONLY use the database for offers
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletCreditForPackage = walletCreditForPackage;
const GST_PERCENTAGE = 28;
function walletCreditForPackage(payAmount, bonusPercent) {
    // Remove GST from the paid amount
    const baseAmount = payAmount / (1 + GST_PERCENTAGE / 100);
    // Calculate total credit
    const totalCredit = baseAmount * (1 + bonusPercent / 100);
    return Math.round(totalCredit * 100) / 100;
}
// Remove assertAllowedWalletPackage - it's not needed
// Remove ALLOWED_WALLET_PACKAGE_KEYS - it's not needed
// Remove packageKey - it's not needed
