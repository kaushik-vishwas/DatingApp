import type { DiscoverReceiverSummary } from '../types/api';

export type ReceiverPresenceStatus = 'available' | 'offline' | 'busy';

export type ReceiverPresenceInfo = {
  status: ReceiverPresenceStatus;
  label: string;
  color: string;
  canCall: boolean;
  canMessage: boolean;
};

const STATUS_GREEN = '#22c55e';
const STATUS_RED = '#dc2626';
const STATUS_YELLOW = '#f59e0b';

export function getReceiverPresenceInfo(receiver: DiscoverReceiverSummary): ReceiverPresenceInfo {
  // Logged out / disconnected should always appear Offline (red).
  if (!Boolean(receiver.isOnline)) {
    return {
      status: 'offline',
      label: 'Offline',
      color: STATUS_RED,
      canCall: false,
      canMessage: true,
    };
  }

  // Busy is reserved for "online but currently occupied on another call".
  if (Boolean(receiver.isBusyOnCall)) {
    return {
      status: 'busy',
      label: 'Busy',
      color: STATUS_YELLOW,
      canCall: false,
      canMessage: true,
    };
  }

  // Online but manually unavailable (switch OFF) should still read Offline (red).
  if (!Boolean(receiver.isAvailable)) {
    return {
      status: 'offline',
      label: 'Offline',
      color: STATUS_RED,
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
