"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPLAY_NAME_MAX_LENGTH = void 0;
exports.displayNameTooLongMessage = displayNameTooLongMessage;
exports.DISPLAY_NAME_MAX_LENGTH = 25;
function displayNameTooLongMessage(raw) {
    const name = String(raw).trim().replace(/ {2,}/g, ' ');
    if (name.length > exports.DISPLAY_NAME_MAX_LENGTH) {
        return 'Display name can be at most 25 characters.';
    }
    return null;
}
