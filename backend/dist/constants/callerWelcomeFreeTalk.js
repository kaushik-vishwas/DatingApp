"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CALLER_WELCOME_FREE_TALK_INR = exports.CALLER_WELCOME_FREE_TALK_MINUTES = void 0;
const Receiver_1 = require("../models/Receiver");
/** Free talk granted once when a new caller account is created. */
exports.CALLER_WELCOME_FREE_TALK_MINUTES = 2;
exports.CALLER_WELCOME_FREE_TALK_INR = exports.CALLER_WELCOME_FREE_TALK_MINUTES * Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN;
