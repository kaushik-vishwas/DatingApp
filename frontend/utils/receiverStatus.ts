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
  const acceptingCalls = Boolean(receiver.isAvailable);
  const loggedIn = Boolean(receiver.isOnline);

  if (Boolean(receiver.isBusyOnCall)) {
    return {
      status: 'busy',
      label: 'Busy',
      color: STATUS_YELLOW,
      canCall: false,
      canMessage: true,
    };
  }

  if (acceptingCalls && loggedIn) {
    return {
      status: 'available',
      label: 'Available',
      color: STATUS_GREEN,
      canCall: true,
      canMessage: true,
    };
  }

  // On call, offline, or switch-off: show Busy on caller UI (engagement; still not callable).
  return {
    status: 'busy',
    label: 'Busy',
    color: STATUS_YELLOW,
    canCall: false,
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

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/** Available first, then busy, then offline — shuffled randomly within each group on every fetch. */
export function sortDiscoverReceivers(rows: DiscoverReceiverSummary[]): DiscoverReceiverSummary[] {
  const available: DiscoverReceiverSummary[] = [];
  const busy: DiscoverReceiverSummary[] = [];
  const offline: DiscoverReceiverSummary[] = [];
  for (const row of rows) {
    const rank = getReceiverPresenceSortRank(row);
    if (rank === 0) available.push(row);
    else if (rank === 1) busy.push(row);
    else offline.push(row);
  }
  shuffleInPlace(available);
  shuffleInPlace(busy);
  shuffleInPlace(offline);
  return [...available, ...busy, ...offline];
}
