/**
 * Whole minutes for leaderboard-style totals (from summed call `durationSec`).
 * Uses half-up rounding so 90s → 2 min, 29s → 0 min.
 */
export function leaderboardMinutesFromSeconds(sec: number): number {
  const s = Math.max(0, Number(sec));
  if (!Number.isFinite(s)) return 0;
  return Math.round(s / 60);
}

/** Compact human duration for a single call row (no forced minimum). */
export function formatCallDurationCompact(sec: number): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  if (r === 0) return `${m} min`;
  return `${m}m ${r}s`;
}
