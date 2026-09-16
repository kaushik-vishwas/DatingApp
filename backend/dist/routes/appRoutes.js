"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const appUpdateController_1 = require("../controllers/appUpdateController");
const router = (0, express_1.Router)();
router.get('/update-policy', appUpdateController_1.getAppUpdatePolicy);
exports.default = router;
