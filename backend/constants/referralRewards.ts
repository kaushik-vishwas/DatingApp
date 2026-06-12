export type ReferralPartyRole = 'caller' | 'receiver';

/** INR reward matrix — referrer role × referred role at signup. */
export const REFERRAL_REWARD_MATRIX_INR: Record<ReferralPartyRole, Record<ReferralPartyRole, number>> = {
  caller: {
    caller: 50,
    receiver: 100,
  },
  receiver: {
    caller: 150,
    receiver: 200,
  },
};

export function resolveReferralRewardInr(
  referrerRole: ReferralPartyRole,
  referredRole: ReferralPartyRole
): number {
  return REFERRAL_REWARD_MATRIX_INR[referrerRole][referredRole];
}
