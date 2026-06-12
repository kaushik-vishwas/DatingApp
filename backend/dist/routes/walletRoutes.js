"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const walletController_1 = require("../controllers/walletController");
const walletOffersController_1 = require("../controllers/walletOffersController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/topups', auth_1.protect, walletController_1.listWalletTopups);
router.get('/credits', auth_1.protect, walletController_1.listWalletCredits);
// Active wallet offers (recharge packs) for caller app.
router.get('/offers', auth_1.protect, walletOffersController_1.listWalletOffers);
router.post('/razorpay-order', auth_1.protect, walletController_1.createRazorpayWalletOrder);
router.post('/razorpay-verify', auth_1.protect, walletController_1.verifyRazorpayWalletPayment);
router.post('/credit', auth_1.protect, walletController_1.creditWallet);
exports.default = router;
