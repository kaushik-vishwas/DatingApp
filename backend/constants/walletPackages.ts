// Remove ALL static constants - they're not needed anymore
// Your backend should ONLY use the database for offers

import {
  WALLET_RECHARGE_GST_PERCENT,
  walletCreditForRecharge,
} from './walletRechargeFees';

export { WALLET_RECHARGE_GST_PERCENT as GST_PERCENTAGE };

export function walletCreditForPackage(walletAmount: number, bonusPercent: number): number {
  return walletCreditForRecharge(walletAmount, bonusPercent);
}

// Remove assertAllowedWalletPackage - it's not needed
// Remove ALLOWED_WALLET_PACKAGE_KEYS - it's not needed
// Remove packageKey - it's not needed