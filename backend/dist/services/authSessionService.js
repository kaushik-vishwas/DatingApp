"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bumpUserAuthSession = bumpUserAuthSession;
exports.bumpReceiverAuthSession = bumpReceiverAuthSession;
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
async function bumpUserAuthSession(userId) {
    const doc = await User_1.default.findByIdAndUpdate(userId, { $inc: { authSessionVersion: 1 } }, { new: true, select: 'authSessionVersion' }).lean();
    return typeof doc?.authSessionVersion === 'number' && Number.isFinite(doc.authSessionVersion)
        ? doc.authSessionVersion
        : 1;
}
async function bumpReceiverAuthSession(receiverId) {
    const doc = await Receiver_1.default.findByIdAndUpdate(receiverId, { $inc: { authSessionVersion: 1 } }, { new: true, select: 'authSessionVersion' }).lean();
    return typeof doc?.authSessionVersion === 'number' && Number.isFinite(doc.authSessionVersion)
        ? doc.authSessionVersion
        : 1;
}
