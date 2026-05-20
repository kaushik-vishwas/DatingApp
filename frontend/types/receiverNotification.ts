export type ReceiverNotificationKind = 'message' | 'call' | 'withdrawal' | 'earning';

export type ReceiverNotificationRow = {
  id: string;
  title: string;
  subtitle: string;
  at: string;
  type: ReceiverNotificationKind;
  peerId?: string;
  peerName?: string;
  peerImage?: string | null;
};
