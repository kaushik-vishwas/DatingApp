"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAT_TEXT_FEE_INR = exports.CHAT_TEXT_EARN_INR = exports.CHAT_TEXT_CHARGE_INR = void 0;
/** Caller wallet debit per paid text message (after receiver's first reply). */
exports.CHAT_TEXT_CHARGE_INR = 1;
/** Receiver wallet credit and stored `feeInr` per paid text message. */
exports.CHAT_TEXT_EARN_INR = 0.5;
/** @deprecated Use CHAT_TEXT_EARN_INR — kept for legacy analytics fallbacks. */
exports.CHAT_TEXT_FEE_INR = exports.CHAT_TEXT_EARN_INR;
