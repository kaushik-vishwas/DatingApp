import type { DiscoverReceiverSummary } from '../types/api';

export type ReceiverPresenceStatus = 'offline' | 'available' | 'busy';

export type ReceiverPresenceInfo = {
  status: ReceiverPresenceStatus;
  label: string;
  color: string;
  canCall: boolean;
  canMessage: boolean;
};

const STATUS_GREEN = '#22c55e';
const STATUS_YELLOW = '#f59e0b';
const STATUS_RED = '#dc2626';

export function getReceiverPresenceInfo(receiver: DiscoverReceiverSummary): ReceiverPresenceInfo {
  if (!receiver.isOnline) {
    return {
      status: 'offline',
      label: 'Offline',
      color: STATUS_RED,
      canCall: false,
      canMessage: true,
    };
  }

  if (!receiver.isAvailable) {
    return {
      status: 'busy',
      label: 'Busy',
      color: STATUS_YELLOW,
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
