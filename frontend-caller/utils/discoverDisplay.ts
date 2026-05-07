/** Deterministic UI-only metrics for discover cards until real ratings / presence APIs exist. */

export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function receiverCardMetrics(id: string) {
  const h = hashId(id);
  const rating = Math.round((4 + (h % 10) / 10) * 10) / 10;
  const reviews = 50 + (h % 400);
  const busy = h % 4 === 0;
  return { rating, reviews, busy };
}
