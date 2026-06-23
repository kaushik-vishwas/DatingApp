"use strict";
// Remove ALL static constants - they're not needed anymore
// Your backend should ONLY use the database for offers
Object.defineProperty(exports, "__esModule", { value: true });
exports.GST_PERCENTAGE = void 0;
exports.walletCreditForPackage = walletCreditForPackage;
const walletRechargeFees_1 = require("./walletRechargeFees");
Object.defineProperty(exports, "GST_PERCENTAGE", { enumerable: true, get: function () { return walletRechargeFees_1.WALLET_RECHARGE_GST_PERCENT; } });
function walletCreditForPackage(walletAmount, bonusPercent) {
    return (0, walletRechargeFees_1.walletCreditForRecharge)(walletAmount, bonusPercent);
}
// Remove assertAllowedWalletPackage - it's not needed
// Remove ALLOWED_WALLET_PACKAGE_KEYS - it's not needed
// Remove packageKey - it's not needed
