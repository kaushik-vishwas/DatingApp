import type { DiscoverReceiverSummary } from '../types/api';

export type ReceiverPresenceStatus = 'available' | 'not_available';

export type ReceiverPresenceInfo = {
  status: ReceiverPresenceStatus;
  label: string;
  color: string;
  canCall: boolean;
  canMessage: boolean;
};

const STATUS_GREEN = '#22c55e';
const STATUS_RED = '#dc2626';

export function getReceiverPresenceInfo(receiver: DiscoverReceiverSummary): ReceiverPresenceInfo {
  const canTakeCall = Boolean(receiver.isOnline) && Boolean(receiver.isAvailable);
  if (!canTakeCall) {
    return {
      status: 'not_available',
      label: 'Receiver not available',
      color: STATUS_RED,
      canCall: false,
      canMessage: true,
    };
  }

  return {
    status: 'available',
    label: 'Available',
    color: STATUS_GREEN,
    canCall: canTakeCall,
    canMessage: true,
  };
}
