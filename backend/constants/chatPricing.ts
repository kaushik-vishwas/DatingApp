/** Caller wallet debit per paid text message (after receiver's first reply). */
export const CHAT_TEXT_CHARGE_INR = 1;

/** Receiver wallet credit and stored `feeInr` per paid text message. */
export const CHAT_TEXT_EARN_INR = 0.5;

/** @deprecated Use CHAT_TEXT_EARN_INR — kept for legacy analytics fallbacks. */
export const CHAT_TEXT_FEE_INR = CHAT_TEXT_EARN_INR;
