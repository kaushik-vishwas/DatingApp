"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatController_1 = require("../controllers/chatController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/messages', auth_1.protect, chatController_1.getMessages);
router.get('/conversations', auth_1.protect, chatController_1.listConversations);
exports.default = router;
