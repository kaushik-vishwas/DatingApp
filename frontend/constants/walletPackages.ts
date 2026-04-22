/** Recharge grid — pairs must match backend `ALLOWED_PACKAGES` in walletController. */

export type WalletPackage = {
  pay: number;
  bonus: number;
  popular?: boolean;
};

/** Row-major for a 2-column grid (left column / right column per Figma). */
export const WALLET_PACKAGES: WalletPackage[] = [
  { pay: 50, bonus: 5 },
  { pay: 50, bonus: 15 },
  { pay: 140, bonus: 20 },
  { pay: 200, bonus: 25 },
  { pay: 300, bonus: 35, popular: true },
  { pay: 500, bonus: 35 },
  { pay: 900, bonus: 35 },
  { pay: 1900, bonus: 40 },
  { pay: 9800, bonus: 40 },
  { pay: 15000, bonus: 45 },
];

export function creditForPackage(p: WalletPackage): number {
  return Math.round(p.pay * (1 + p.bonus / 100) * 100) / 100;
}
