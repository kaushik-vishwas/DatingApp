"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const discoverController_1 = require("../controllers/discoverController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/receivers', auth_1.protect, discoverController_1.listReceiversForCaller);
exports.default = router;
