import type { DiscoverReceiverSummary } from '../types/api';

export type ReceiverPresenceStatus = 'available' | 'offline' | 'busy';

export type ReceiverPresenceInfo = {
  status: ReceiverPresenceStatus;
  label: string;
  color: string;
  canCall: boolean;
  canMessage: boolean;
};

/** Online and callable */
export const STATUS_GREEN = '#22c55e';
/** On another call */
export const STATUS_YELLOW = '#f59e0b';
/** Logged out or manually unavailable */
export const STATUS_GREY = '#9ca3af';

export function getReceiverPresenceInfo(receiver: DiscoverReceiverSummary): ReceiverPresenceInfo {
  if (!Boolean(receiver.isOnline)) {
    return {
      status: 'offline',
      label: 'Offline',
      color: STATUS_GREY,
      canCall: false,
      canMessage: true,
    };
  }

  if (Boolean(receiver.isBusyOnCall)) {
    return {
      status: 'busy',
      label: 'Busy',
      color: STATUS_YELLOW,
      canCall: false,
      canMessage: true,
    };
  }

  if (!Boolean(receiver.isAvailable)) {
    return {
      status: 'offline',
      label: 'Not available',
      color: STATUS_GREY,
      canCall: false,
      canMessage: true,
    };
  }

  return {
    status: 'available',
    label: 'Available',
    color: STATUS_GREEN,
    canCall: true,
    canMessage: true,
  };
}

/** Lower rank = shown earlier on discover (available → busy → offline). */
export function getReceiverPresenceSortRank(receiver: DiscoverReceiverSummary): number {
  const { status } = getReceiverPresenceInfo(receiver);
  if (status === 'available') return 0;
  if (status === 'busy') return 1;
  return 2;
}

/** Online/available first, then higher ratings within each group. */
export function sortDiscoverReceivers(rows: DiscoverReceiverSummary[]): DiscoverReceiverSummary[] {
  return [...rows].sort((a, b) => {
    const rankDiff = getReceiverPresenceSortRank(a) - getReceiverPresenceSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    const ratingDiff = (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
  });
}
