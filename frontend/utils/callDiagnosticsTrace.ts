export type CallTraceInfo = {
  stack: string;
  sourceFunction: string | null;
  sourceFile: string | null;
  sourceLine: number | null;
  sourceColumn: number | null;
};

const RN_STACK_RE =
  /^\s*at\s+(?:(.+?)\s+)?\(?((?:file:\/\/\/|https?:\/\/|\w:)[^)]+):(\d+):(\d+)\)?$/;
const RN_STACK_RE_FN =
  /^\s*at\s+([^\s(]+)(?:\s*\(|$)/;

function parseStackLine(line: string): Partial<CallTraceInfo> {
  const m = line.match(RN_STACK_RE);
  if (m) {
    const fn = m[1]?.trim() || null;
    const file = m[2]?.replace('file:///', '') ?? null;
    return {
      sourceFunction: fn,
      sourceFile: file,
      sourceLine: Number(m[3]) || null,
      sourceColumn: Number(m[4]) || null,
    };
  }
  const fnOnly = line.match(RN_STACK_RE_FN);
  if (fnOnly) {
    return { sourceFunction: fnOnly[1] ?? null };
  }
  return {};
}

/** Capture JS stack at the call site (skip this helper frames). */
export function captureCallTrace(skipFrames = 2): CallTraceInfo {
  const err = new Error();
  const stack = err.stack ?? '';
  const lines = stack.split('\n').filter(Boolean);
  const callerLine = lines[skipFrames + 1] ?? lines[skipFrames] ?? '';
  const parsed = parseStackLine(callerLine);
  return {
    stack,
    sourceFunction: parsed.sourceFunction ?? null,
    sourceFile: parsed.sourceFile ?? null,
    sourceLine: parsed.sourceLine ?? null,
    sourceColumn: parsed.sourceColumn ?? null,
  };
}
