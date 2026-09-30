"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const callController_1 = require("../controllers/callController");
const router = (0, express_1.Router)();
router.get('/bootstrap', auth_1.protect, callController_1.getVoiceBootstrap);
router.get('/incoming-pending', auth_1.protect, callController_1.getIncomingPending);
router.post('/session/start', auth_1.protect, callController_1.startVoiceSession);
router.post('/session/sync', auth_1.protect, callController_1.syncVoiceSession);
router.post('/session/end', auth_1.protect, callController_1.endVoiceSession);
router.post('/session/rate', auth_1.protect, callController_1.rateVoiceSession);
router.post('/session/report', auth_1.protect, callController_1.reportVoiceSessionIssue);
// Native Android (no JS): decline from the notification / confirm the notification rang.
router.post('/:callId/decline', auth_1.protect, callController_1.declineIncomingCall);
router.post('/:callId/ringing', auth_1.protect, callController_1.acknowledgeIncomingCallRinging);
router.post('/:callId/seen', auth_1.protect, callController_1.markIncomingCallSeen);
exports.default = router;
