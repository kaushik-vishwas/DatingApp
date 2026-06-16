"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyVoiceGenderLocally = classifyVoiceGenderLocally;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const voiceGenderLocalCore_1 = require("./voiceGenderLocalCore");
let classifyTail = Promise.resolve();
let workerChild = null;
function asString(v) {
    return typeof v === 'string' ? v.trim() : '';
}
function shouldUseWorkerProcess() {
    const raw = asString(process.env.VOICE_GENDER_USE_WORKER).toLowerCase();
    if (raw === 'true' || raw === '1' || raw === 'on')
        return true;
    if (raw === 'false' || raw === '0' || raw === 'off')
        return false;
    return process.env.NODE_ENV === 'production';
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
function workerScriptPath() {
    return path_1.default.join(__dirname, 'voiceGenderWorkerProcess.js');
}
function resetWorkerChild() {
    if (workerChild && !workerChild.killed) {
        workerChild.kill('SIGTERM');
    }
    workerChild = null;
}
function spawnWorkerChild() {
    const child = (0, child_process_1.fork)(workerScriptPath(), [], {
        env: process.env,
        execArgv: ['--max-old-space-size=768'],
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    child.on('exit', () => {
        if (workerChild === child) {
            workerChild = null;
        }
    });
    workerChild = child;
    return child;
}
function classifyViaWorker(audioSource, expectedGender) {
    const timeoutMs = Number(process.env.VOICE_GENDER_TIMEOUT_MS ?? 120000);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
        const child = workerChild && !workerChild.killed ? workerChild : spawnWorkerChild();
        const finish = (result) => {
            clearTimeout(timer);
            child.off('message', onMessage);
            child.off('exit', onExit);
            resolve(result);
        };
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
            resetWorkerChild();
            const oom = signal === 'SIGKILL' || signal === 'SIGABRT';
            finish({
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: 'voice-gender-worker',
                failureKind: 'service_unavailable',
                reason: oom
                    ? 'Voice verification ran out of memory on server. Add swap or upgrade EC2 RAM, then retry.'
                    : `Voice verification worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
            });
        };
        const timer = setTimeout(() => {
            resetWorkerChild();
            finish({
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: 'voice-gender-worker',
                failureKind: 'service_unavailable',
                reason: 'Voice verification timed out on server',
            });
        }, Math.max(30_000, timeoutMs));
        child.on('message', onMessage);
        child.once('exit', onExit);
        child.send({ id, audioSource, expectedGender });
    });
}
async function classifyVoiceGenderLocally(audioSource, expectedGender) {
    return withLocalClassifyLock(async () => {
        if (shouldUseWorkerProcess()) {
            return classifyViaWorker(audioSource, expectedGender);
        }
        return (0, voiceGenderLocalCore_1.classifyVoiceGenderLocallyCore)(audioSource, expectedGender);
    });
}
