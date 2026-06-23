"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WALLET_RECHARGE_GST_PERCENT = void 0;
exports.walletRechargePlatformFeePercent = walletRechargePlatformFeePercent;
exports.computeWalletRechargeBreakdown = computeWalletRechargeBreakdown;
exports.walletCreditForRecharge = walletCreditForRecharge;
exports.payableMatchesWalletPack = payableMatchesWalletPack;
exports.WALLET_RECHARGE_GST_PERCENT = 18;
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
function walletRechargePlatformFeePercent(walletAmount) {
    return walletAmount >= 1000 ? 5 : 10;
}
function computeWalletRechargeBreakdown(walletAmount) {
    const wallet = Math.max(0, roundInr(walletAmount));
    const platformFeePercent = walletRechargePlatformFeePercent(wallet);
    const platformFee = roundInr((wallet * platformFeePercent) / 100);
    const preTax = roundInr(wallet + platformFee);
    const gstPercent = exports.WALLET_RECHARGE_GST_PERCENT;
    const gstAmount = roundInr((preTax * gstPercent) / 100);
    const totalPayable = roundInr(preTax + gstAmount);
    return {
        walletAmount: wallet,
        platformFeePercent,
        platformFee,
        gstPercent,
        gstAmount,
        totalPayable,
    };
}
/** Wallet credit from pack amount + bonus (excludes platform fee and GST). */
function walletCreditForRecharge(walletAmount, bonusPercent) {
    const wallet = Math.max(0, roundInr(walletAmount));
    const bonus = Number.isFinite(bonusPercent) ? bonusPercent : 0;
    return roundInr(wallet * (1 + bonus / 100));
}
function payableMatchesWalletPack(walletAmount, totalPayable, toleranceInr = 0.01) {
    const expected = computeWalletRechargeBreakdown(walletAmount).totalPayable;
    return Math.abs(expected - totalPayable) <= toleranceInr;
}
