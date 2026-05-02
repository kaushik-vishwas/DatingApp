import User from '../models/User';
import Receiver from '../models/Receiver';

export async function bumpUserAuthSession(userId: string): Promise<number> {
  const doc = await User.findByIdAndUpdate(
    userId,
    { $inc: { authSessionVersion: 1 } },
    { new: true, select: 'authSessionVersion' }
  ).lean<{ authSessionVersion?: number } | null>();
  return typeof doc?.authSessionVersion === 'number' && Number.isFinite(doc.authSessionVersion)
    ? doc.authSessionVersion
    : 1;
}

export async function bumpReceiverAuthSession(receiverId: string): Promise<number> {
  const doc = await Receiver.findByIdAndUpdate(
    receiverId,
    { $inc: { authSessionVersion: 1 } },
    { new: true, select: 'authSessionVersion' }
  ).lean<{ authSessionVersion?: number } | null>();
  return typeof doc?.authSessionVersion === 'number' && Number.isFinite(doc.authSessionVersion)
    ? doc.authSessionVersion
    : 1;
}
