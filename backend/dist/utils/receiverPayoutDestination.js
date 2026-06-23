"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferReceiverPayoutMethod = inferReceiverPayoutMethod;
exports.resolveBankPayoutMode = resolveBankPayoutMode;
exports.resolveReceiverPayoutDestination = resolveReceiverPayoutDestination;
const receiverPaymentDetails_1 = require("./receiverPaymentDetails");
function safeTrim(s) {
    return typeof s === 'string' ? s.trim() : '';
}
/** Prefer UPI when both are on file unless a withdrawal snapshot says otherwise. */
function inferReceiverPayoutMethod(receiver) {
    if ((0, receiverPaymentDetails_1.receiverHasValidUpi)(receiver))
        return 'upi';
    if ((0, receiverPaymentDetails_1.receiverHasValidBank)(receiver))
        return 'bank';
    return null;
}
function resolveBankPayoutMode() {
    const raw = process.env.RAZORPAYX_BANK_PAYOUT_MODE?.trim().toUpperCase() ||
        process.env.RAZORPAYX_PAYOUT_MODE?.trim().toUpperCase();
    if (raw === 'NEFT' || raw === 'RTGS')
        return raw;
    return 'IMPS';
}
function resolveReceiverPayoutDestination(options) {
    const { receiver, contactEmail, preferredMethod } = options;
    const payeeName = safeTrim(receiver.nameAsPerAadhaar) ||
        safeTrim(receiver.bankAccountHolderName) ||
        safeTrim(receiver.name);
    const phone = safeTrim(receiver.phone);
    if (!payeeName || !phone)
        return null;
    let method = null;
    if (preferredMethod === 'upi' && (0, receiverPaymentDetails_1.receiverHasValidUpi)(receiver))
        method = 'upi';
    else if (preferredMethod === 'bank' && (0, receiverPaymentDetails_1.receiverHasValidBank)(receiver))
        method = 'bank';
    else
        method = inferReceiverPayoutMethod(receiver);
    if (!method)
        return null;
    const contact = {
        name: payeeName,
        email: contactEmail,
        contact: phone.replace(/\D/g, '').slice(-10),
        type: 'customer',
        reference_id: `recv_${String(receiver._id).slice(-10)}`.slice(0, 40),
    };
    if (method === 'upi') {
        const upiId = (0, receiverPaymentDetails_1.normalizeUpiId)(receiver.upiId);
        if (!upiId)
            return null;
        return {
            payoutMethod: 'upi',
            mode: 'UPI',
            fundAccount: {
                account_type: 'vpa',
                vpa: { address: upiId },
                contact,
            },
        };
    }
    const accountNumber = (0, receiverPaymentDetails_1.normalizeBankAccountNumber)(receiver.bankAccountNumber);
    const ifsc = safeTrim(receiver.bankIfsc).toUpperCase();
    if (!accountNumber || !ifsc)
        return null;
    return {
        payoutMethod: 'bank',
        mode: resolveBankPayoutMode(),
        fundAccount: {
            account_type: 'bank_account',
            bank_account: {
                name: safeTrim(receiver.bankAccountHolderName) || payeeName,
                ifsc,
                account_number: accountNumber,
            },
            contact,
        },
    };
}
