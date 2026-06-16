import { fork, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { ExpectedVoiceGender, VoiceGenderVerificationResult } from './callerVoiceGenderVerifier';

let classifyTail: Promise<void> = Promise.resolve();
let workerChild: ChildProcess | null = null;

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Keep heavy Transformers.js model out of the API process (default: on). */
export function shouldUseVoiceGenderWorker(): boolean {
  const raw = asString(process.env.VOICE_GENDER_USE_WORKER).toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return true;
}

export function voiceGenderWorkerScriptPath(): string {
  return path.join(__dirname, 'voiceGenderWorkerProcess.js');
}

function workerHeapMb(): number {
  const n = Number(process.env.VOICE_GENDER_WORKER_HEAP_MB ?? 512);
  return Number.isFinite(n) && n >= 256 ? Math.floor(n) : 512;
}

async function withLocalClassifyLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = classifyTail;
  let release!: () => void;
  classifyTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function resetWorkerChild(): void {
  if (workerChild && !workerChild.killed) {
    workerChild.kill('SIGTERM');
  }
  workerChild = null;
}

function getOrSpawnWorker(): ChildProcess | null {
  if (workerChild && !workerChild.killed) {
    return workerChild;
  }

  const workerScript = voiceGenderWorkerScriptPath();
  if (!fs.existsSync(workerScript)) {
    return null;
  }

  const child = fork(workerScript, [], {
    env: process.env,
    execArgv: [`--max-old-space-size=${workerHeapMb()}`],
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  child.on('exit', () => {
    if (workerChild === child) {
      workerChild = null;
    }
  });

  workerChild = child;
  console.log('[voice-gender-worker] spawned', { pid: child.pid, script: workerScript });
  return child;
}

function classifyViaWorker(
  audioSource: string,
  expectedGender: ExpectedVoiceGender
): Promise<VoiceGenderVerificationResult> {
  const timeoutMs = Math.max(
    120_000,
    Number(process.env.VOICE_GENDER_TIMEOUT_MS ?? 120000) || 120_000
  );
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    let settled = false;
    const child = getOrSpawnWorker();

    const finish = (result: VoiceGenderVerificationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child) {
        child.off('message', onMessage);
        child.off('exit', onExit);
        child.off('error', onError);
      }
      resolve(result);
    };

    if (!child) {
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'misconfigured',
        reason: `Voice worker not deployed (${voiceGenderWorkerScriptPath()}). Run npm run build on server.`,
      });
      return;
    }

    const onMessage = (msg: {
      id?: string;
      ok?: boolean;
      result?: VoiceGenderVerificationResult;
      error?: string;
    }) => {
      if (!msg || msg.id !== id) return;
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

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      resetWorkerChild();
      const oom = signal === 'SIGKILL' || signal === 'SIGABRT';
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'service_unavailable',
        reason: oom
          ? 'Voice verification ran out of memory on server. Add 2G swap on EC2 (sudo swapon), then retry.'
          : `Voice verification worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      });
    };

    const onError = (err: Error) => {
      console.error('[voice-gender-worker] error', err);
      resetWorkerChild();
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'service_unavailable',
        reason: err.message,
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
    child.on('error', onError);

    child.send({ id, audioSource, expectedGender });
  });
}

function runWorkerJob(
  payload: { id: string; warmup?: boolean; audioSource?: string; expectedGender?: ExpectedVoiceGender },
  timeoutMs: number
): Promise<{ ok: boolean; result?: VoiceGenderVerificationResult; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const child = getOrSpawnWorker();

    const finish = (out: { ok: boolean; result?: VoiceGenderVerificationResult; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child) {
        child.off('message', onMessage);
        child.off('exit', onExit);
      }
      resolve(out);
    };

    if (!child) {
      finish({ ok: false, error: 'Voice worker not deployed' });
      return;
    }

    const onMessage = (msg: {
      id?: string;
      ok?: boolean;
      result?: VoiceGenderVerificationResult;
      error?: string;
    }) => {
      if (!msg || msg.id !== payload.id) return;
      if (msg.ok && msg.result) {
        finish({ ok: true, result: msg.result });
        return;
      }
      finish({ ok: false, error: msg.error || 'Voice worker failed' });
    };

    const onExit = () => {
      if (settled) return;
      resetWorkerChild();
      finish({ ok: false, error: 'Voice worker exited during warmup' });
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'Voice worker warmup timed out' });
    }, timeoutMs);

    child.on('message', onMessage);
    child.once('exit', onExit);
    child.send(payload);
  });
}

export async function warmVoiceGenderWorkerInBackground(): Promise<void> {
  if (!shouldUseVoiceGenderWorker()) return;
  const id = `warmup-${Date.now()}`;
  const out = await runWorkerJob({ id, warmup: true }, 180_000);
  if (out.ok) {
    console.log('[voice-gender-worker] warmup complete');
    return;
  }
  console.warn('[voice-gender-worker] warmup failed:', out.error);
}

export async function classifyVoiceGenderLocally(
  audioSource: string,
  expectedGender: ExpectedVoiceGender
): Promise<VoiceGenderVerificationResult> {
  return withLocalClassifyLock(async () => {
    if (shouldUseVoiceGenderWorker()) {
      return classifyViaWorker(audioSource, expectedGender);
    }
    const { classifyVoiceGenderLocallyCore } = await import('./voiceGenderLocalCore');
    return classifyVoiceGenderLocallyCore(audioSource, expectedGender);
  });
}
