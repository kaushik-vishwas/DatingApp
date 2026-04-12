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
 * Loads the nearest `.env` walking up from `process.cwd()`, preferring the one
 * closest to the filesystem root (so repo-root `.env` wins over `backend/.env`).
 */
function loadEnv() {
    let dir = path_1.default.resolve(process.cwd());
    let chosen = null;
    for (let i = 0; i < 8; i++) {
        const p = path_1.default.join(dir, '.env');
        if (fs_1.default.existsSync(p)) {
            chosen = p;
        }
        const parent = path_1.default.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    if (chosen) {
        dotenv_1.default.config({ path: chosen });
        return;
    }
    dotenv_1.default.config();
}
