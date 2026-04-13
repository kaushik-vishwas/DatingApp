"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
/**
 * Loads `backend/.env` next to this package root, whether this file runs from
 * `backend/config` (ts-node/tsx) or `backend/dist/config` (compiled `node dist/...`).
 */
function loadEnv() {
    const backendRoot = path_1.default.basename(path_1.default.dirname(__dirname)) === 'dist'
        ? path_1.default.resolve(__dirname, '..', '..')
        : path_1.default.resolve(__dirname, '..');
    const envPath = path_1.default.join(backendRoot, '.env');
    if (fs_1.default.existsSync(envPath)) {
        dotenv_1.default.config({ path: envPath });
        return;
    }
    dotenv_1.default.config();
}
