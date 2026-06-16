"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldUseVoiceGenderWorker = shouldUseVoiceGenderWorker;
exports.voiceGenderWorkerScriptPath = voiceGenderWorkerScriptPath;
exports.warmVoiceGenderWorkerInBackground = warmVoiceGenderWorkerInBackground;
exports.classifyVoiceGenderLocally = classifyVoiceGenderLocally;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let classifyTail = Promise.resolve();
function asString(v) {
    return typeof v === 'string' ? v.trim() : '';
}
/** Keep heavy Transformers.js model out of the API process (default: on). */
function shouldUseVoiceGenderWorker() {
    const raw = asString(process.env.VOICE_GENDER_USE_WORKER).toLowerCase();
    if (raw === 'false' || raw === '0' || raw === 'off')
        return false;
    return true;
}
function voiceGenderWorkerScriptPath() {
    return path_1.default.join(__dirname, 'voiceGenderWorkerProcess.js');
}
async function withLocalClassifyLock(fn) {
    const prev = classifyTail;
    let release;
    classifyTail = new Promise((resolve) => {
        release = resolve;
    });
    await prev;
    try {
        return await fn();
    }
    finally {
        release();
    }
}
function classifyViaWorker(audioSource, expectedGender) {
    const workerScript = voiceGenderWorkerScriptPath();
    const timeoutMs = Math.max(120_000, Number(process.env.VOICE_GENDER_TIMEOUT_MS ?? 120000) || 120_000);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
        let settled = false;
        let child = null;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (child && !child.killed) {
                child.kill('SIGTERM');
            }
            resolve(result);
        };
        if (!fs_1.default.existsSync(workerScript)) {
            finish({
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: 'voice-gender-worker',
                failureKind: 'misconfigured',
                reason: `Voice worker not deployed (${workerScript}). Run npm run build on server.`,
            });
            return;
        }
        try {
            child = (0, child_process_1.fork)(workerScript, [], {
                env: process.env,
                execArgv: ['--max-old-space-size=768'],
                stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            finish({
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: 'voice-gender-worker',
                failureKind: 'service_unavailable',
                reason: `Could not start voice worker: ${msg}`,
            });
            return;
        }
        console.log('[voice-gender-worker] spawned', { pid: child.pid, script: workerScript });
        const onMessage = (msg) => {
            if (!msg || msg.id !== id)
                return;
            if (msg.ok && msg.result) {
                finish(msg.result);
                return;
            }
            finish({
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: 'voice-gender-worker',
                failureKind: 'service_unavailable',
                reason: msg.error || 'Voice verification worker failed',
            });
        };
        const onExit = (code, signal) => {
            if (settled)
                return;
            const oom = signal === 'SIGKILL' || signal === 'SIGABRT';
            finish({
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: 'voice-gender-worker',
                failureKind: 'service_unavailable',
                reason: oom
                    ? 'Voice verification ran out of memory on server. Add 2G swap on EC2, then retry.'
                    : `Voice verification worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
            });
        };
        const timer = setTimeout(() => {
            finish({
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: 'voice-gender-worker',
                failureKind: 'service_unavailable',
                reason: 'Voice verification timed out on server',
            });
        }, timeoutMs);
        child.on('message', onMessage);
        child.once('exit', onExit);
        child.on('error', (err) => {
            console.error('[voice-gender-worker] error', err);
            finish({
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: 'voice-gender-worker',
                failureKind: 'service_unavailable',
                reason: err.message,
            });
        });
        child.send({ id, audioSource, expectedGender });
    });
}
async function warmVoiceGenderWorkerInBackground() {
    if (!shouldUseVoiceGenderWorker())
        return;
    const workerScript = voiceGenderWorkerScriptPath();
    if (!fs_1.default.existsSync(workerScript)) {
        console.warn('[voice-gender-worker] warmup skipped — script missing:', workerScript);
        return;
    }
    await new Promise((resolve) => {
        const id = `warmup-${Date.now()}`;
        let settled = false;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            if (child && !child.killed)
                child.kill('SIGTERM');
            resolve();
        };
        let child = null;
        try {
            child = (0, child_process_1.fork)(workerScript, [], {
                env: process.env,
                execArgv: ['--max-old-space-size=768'],
                stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            });
        }
        catch (err) {
            console.warn('[voice-gender-worker] warmup spawn failed:', err);
            finish();
            return;
        }
        const timer = setTimeout(() => {
            console.warn('[voice-gender-worker] warmup timed out');
            finish();
        }, 180_000);
        child.on('message', (msg) => {
            if (!msg || msg.id !== id || !msg.ok)
                return;
            clearTimeout(timer);
            console.log('[voice-gender-worker] warmup complete', { pid: child?.pid });
            finish();
        });
        child.once('exit', () => {
            clearTimeout(timer);
            finish();
        });
        child.send({ id, warmup: true });
    });
}
async function classifyVoiceGenderLocally(audioSource, expectedGender) {
    return withLocalClassifyLock(async () => {
        if (shouldUseVoiceGenderWorker()) {
            return classifyViaWorker(audioSource, expectedGender);
        }
        const { classifyVoiceGenderLocallyCore } = await Promise.resolve().then(() => __importStar(require('./voiceGenderLocalCore')));
        return classifyVoiceGenderLocallyCore(audioSource, expectedGender);
    });
}
