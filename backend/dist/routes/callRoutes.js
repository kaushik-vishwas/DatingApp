"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const callController_1 = require("../controllers/callController");
const router = (0, express_1.Router)();
router.get('/bootstrap', auth_1.protect, callController_1.getVoiceBootstrap);
exports.default = router;
