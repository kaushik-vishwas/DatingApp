/** Allowed wallet recharge packages — must match `frontend/constants/walletPackages.ts`. */
export const ALLOWED_WALLET_PACKAGE_KEYS = new Set([
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

export function packageKey(payAmount: number, bonusPercent: number): string {
  return `${Math.round(payAmount)}-${Math.round(bonusPercent)}`;
}

export function assertAllowedWalletPackage(payAmount: number, bonusPercent: number): string | null {
  const key = packageKey(payAmount, bonusPercent);
  return ALLOWED_WALLET_PACKAGE_KEYS.has(key) ? null : 'Invalid wallet package';
}

export function walletCreditForPackage(payAmount: number, bonusPercent: number): number {
  return Math.round(payAmount * (1 + bonusPercent / 100) * 100) / 100;
}
