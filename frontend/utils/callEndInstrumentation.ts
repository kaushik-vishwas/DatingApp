import type { Socket } from 'socket.io-client';
import { callDiag, getStateMachineDump } from './callDiagnostics';
import { captureCallTrace } from './callDiagnosticsTrace';
import { callApi } from '../services/api';

type SessionSyncResult = Awaited<ReturnType<typeof callApi.sessionSync>>;

/**
 * Emit `call:end` on a socket with full trace + state snapshot diagnostics.
 */
export function instrumentedEmitCallEnd(
  socket: Socket,
  callId: string,
  reason: string,
  channel: string,
  ack?: (res?: { ok?: boolean }) => void
): void {
  const normalized = callId.trim();
  if (!normalized) return;
  const trace = captureCallTrace(2);
  callDiag.callEndEmitted(reason, {
    callId: normalized,
    channel,
    trace,
    legitimateHint:
      'Verify: was talk active? was peer on GSM hold? did user tap hangup? was this a timeout/cleanup?',
  });
  callDiag.socketEmit('call:end', { callId: normalized, reason }, channel, reason);
  try {
    if (ack) {
      socket.emit('call:end', { callId: normalized }, ack);
    } else {
      socket.emit('call:end', { callId: normalized });
    }
  } catch (e) {
    callDiag.error('socket_emit_call_end_failed', {
      reason,
      channel,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export type SessionSyncCheckResult = {
  data: SessionSyncResult['data'] | null;
  completed: boolean;
  error: string | null;
};

/**
 * Run session sync and emit diagnostics if server reports completed.
 */
export async function instrumentedSessionSync(
  callId: string,
  callerSite: string,
  opts?: { light?: boolean }
): Promise<SessionSyncCheckResult> {
  const normalized = callId.trim();
  if (!normalized) {
    return { data: null, completed: false, error: 'empty_call_id' };
  }
  const trace = captureCallTrace(2);
  callDiag.sessionSyncRequest(callerSite, {
    callId: normalized,
    light: opts?.light ?? false,
    sourceFunction: trace.sourceFunction,
    sourceFile: trace.sourceFile,
    sourceLine: trace.sourceLine,
  });
  try {
    const { data } = await callApi.sessionSync(normalized, opts);
    if (data?.ok && data.status === 'completed') {
      callDiag.sessionSyncCompletedEmitted(callerSite, {
        callId: normalized,
        responseStatus: data.status,
        trace,
        durationSec: data.durationSec,
        talkActive: data.talkActive,
        dump: getStateMachineDump({ callerSite, sessionStatus: data.status }),
        legitimateHint:
          'Server DB status=completed. Check who called session/end or call:end first (see call_end_emitted / socket_receive on both devices).',
      });
      return { data, completed: true, error: null };
    }
    return { data, completed: false, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    callDiag.error('session_sync_failed', { callerSite, callId: normalized, message });
    return { data: null, completed: false, error: message };
  }
}

export async function instrumentedSessionEnd(
  callId: string,
  reason: string
): Promise<ReturnType<typeof callApi.sessionEnd>> {
  const normalized = callId.trim();
  const trace = captureCallTrace(2);
  callDiag.restCallEndEmitted(reason, {
    callId: normalized,
    trace,
    endpoint: '/calls/session/end',
  });
  return callApi.sessionEnd(normalized);
}
