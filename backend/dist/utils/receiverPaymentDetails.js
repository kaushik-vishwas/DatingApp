"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUpiId = normalizeUpiId;
exports.isValidUpiId = isValidUpiId;
exports.isValidPanNumber = isValidPanNumber;
exports.isValidIfsc = isValidIfsc;
exports.normalizeBankAccountNumber = normalizeBankAccountNumber;
exports.receiverHasValidUpi = receiverHasValidUpi;
exports.receiverHasValidBank = receiverHasValidBank;
exports.receiverPaymentDetailsComplete = receiverPaymentDetailsComplete;
exports.parseReceiverPaymentUpdateBody = parseReceiverPaymentUpdateBody;
function normalizeUpiId(raw) {
    return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}
function isValidUpiId(upi) {
    return /^[a-z0-9._-]{2,256}@[a-z]{3,}$/i.test(upi);
}
function isValidPanNumber(pan) {
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase());
}
function isValidIfsc(ifsc) {
    return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc.trim());
}
function normalizeBankAccountNumber(raw) {
    return String(raw ?? '').replace(/\D/g, '');
}
function receiverHasValidUpi(r) {
    const upi = normalizeUpiId(r.upiId);
    return Boolean(upi && isValidUpiId(upi));
}
function receiverHasValidBank(r) {
    const acct = normalizeBankAccountNumber(r.bankAccountNumber);
    const ifsc = String(r.bankIfsc ?? '').trim().toUpperCase();
    return Boolean(acct.length >= 9 && isValidIfsc(ifsc));
}
/** UPI or bank required; Aadhaar name/number optional (if provided must be valid); PAN optional. */
function receiverPaymentDetailsComplete(r) {
    const aadhaarDigits = String(r.aadhaarNumber ?? '').replace(/\D/g, '');
    const aadhaarOk = !aadhaarDigits || /^\d{12}$/.test(aadhaarDigits);
    const pan = String(r.panNumber ?? '').trim().toUpperCase();
    const panOk = !pan || isValidPanNumber(pan);
    const payoutMethod = receiverHasValidUpi(r) || receiverHasValidBank(r);
    return Boolean(aadhaarOk && panOk && payoutMethod);
}
function parseReceiverPaymentUpdateBody(body) {
    const nameAsPerAadhaarRaw = String(body.nameAsPerAadhaar ?? '').trim();
    const nameAsPerAadhaar = nameAsPerAadhaarRaw || null;
    const aadhaarDigitsRaw = String(body.aadhaarNumber ?? '').replace(/\D/g, '');
    if (aadhaarDigitsRaw && !/^\d{12}$/.test(aadhaarDigitsRaw)) {
        return { error: 'Aadhaar number must be 12 digits' };
    }
    const aadhaarDigits = aadhaarDigitsRaw || null;
    const panRaw = String(body.panNumber ?? '').trim().toUpperCase();
    const pan = panRaw || null;
    if (pan && !isValidPanNumber(pan)) {
        return { error: 'Enter a valid PAN (e.g. ABCDE1234F)' };
    }
    const upiRaw = normalizeUpiId(body.upiId);
    if (upiRaw && !isValidUpiId(upiRaw)) {
        return { error: 'Enter a valid UPI ID (e.g. name@bank)' };
    }
    const upiId = upiRaw && isValidUpiId(upiRaw) ? upiRaw : null;
    const bankAccountNumber = normalizeBankAccountNumber(body.bankAccountNumber);
    const bankIfsc = String(body.bankIfsc ?? '').trim().toUpperCase();
    const hasBankFields = bankAccountNumber.length > 0 || bankIfsc.length > 0;
    if (hasBankFields) {
        if (bankAccountNumber.length < 9) {
            return { error: 'Enter a valid bank account number' };
        }
        if (!isValidIfsc(bankIfsc)) {
            return { error: 'Enter a valid 11-character IFSC code' };
        }
    }
    const hasUpi = Boolean(upiId);
    const hasValidBank = hasBankFields && bankAccountNumber.length >= 9 && isValidIfsc(bankIfsc);
    const methodRaw = String(body.payoutMethod ?? '').trim().toLowerCase();
    const explicitMethod = methodRaw === 'upi' || methodRaw === 'bank' ? methodRaw : null;
    if (explicitMethod === 'upi') {
        if (!hasUpi)
            return { error: 'Enter a valid UPI ID (e.g. name@bank)' };
        return {
            nameAsPerAadhaar,
            aadhaarDigits,
            pan,
            upiId,
            bankAccountNumber: null,
            bankIfsc: null,
            bankAccountHolderName: null,
        };
    }
    if (explicitMethod === 'bank') {
        if (!hasValidBank)
            return { error: 'Enter a valid bank account number with IFSC' };
        return {
            nameAsPerAadhaar,
            aadhaarDigits,
            pan,
            upiId: null,
            bankAccountNumber,
            bankIfsc,
            bankAccountHolderName: nameAsPerAadhaar,
        };
    }
    if (!hasUpi && !hasValidBank) {
        return { error: 'Enter a valid UPI ID or bank account number with IFSC' };
    }
    return {
        nameAsPerAadhaar,
        aadhaarDigits,
        pan,
        upiId: hasUpi ? upiId : null,
        bankAccountNumber: hasValidBank ? bankAccountNumber : null,
        bankIfsc: hasValidBank ? bankIfsc : null,
        bankAccountHolderName: hasValidBank ? nameAsPerAadhaar : null,
    };
}
