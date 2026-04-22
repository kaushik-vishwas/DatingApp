import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import ChatBlock from '../models/ChatBlock';
import User from '../models/User';
import Receiver from '../models/Receiver';
import {
  buildVoiceCallId,
  createStreamUserToken,
  getStreamApiKey,
  toStreamUserId,
} from '../utils/streamVoice';

export const getVoiceBootstrap = async (req: Request, res: Response): Promise<void> => {
  const accountKind = req.accountKind;
  const meId = accountKind === 'user' ? String(req.user?._id ?? '') : String(req.receiver?._id ?? '');
  const peerId = typeof req.query.peerId === 'string' ? req.query.peerId.trim() : '';
  if (!accountKind || !meId) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(peerId)) {
    res.status(400).json({ message: 'Valid peerId is required' });
    return;
  }

  const callerUserId = accountKind === 'user' ? meId : peerId;
  const receiverId = accountKind === 'receiver' ? meId : peerId;

  const [callerDoc, receiverDoc] = await Promise.all([
    User.findById(callerUserId).select('accountStatus suspended'),
    Receiver.findById(receiverId).select('accountStatus suspended'),
  ]);

  if (!callerDoc || callerDoc.accountStatus !== 'approved' || callerDoc.suspended) {
    res.status(403).json({ message: 'Caller account is not allowed for calling' });
    return;
  }
  if (!receiverDoc || receiverDoc.accountStatus !== 'approved' || receiverDoc.suspended) {
    res.status(403).json({ message: 'Receiver account is not allowed for calling' });
    return;
  }
  if (await ChatBlock.exists({ userId: callerUserId, receiverId })) {
    res.status(403).json({ message: 'This pair is blocked for communication' });
    return;
  }

  const meStreamUserId = toStreamUserId(accountKind, meId);
  const peerStreamUserId = toStreamUserId(accountKind === 'user' ? 'receiver' : 'user', peerId);
  const { token, expiresAt } = createStreamUserToken(meStreamUserId);
  const callId = buildVoiceCallId(meStreamUserId, peerStreamUserId);

  res.json({
    apiKey: getStreamApiKey(),
    token,
    tokenExpiresAt: expiresAt,
    streamUserId: meStreamUserId,
    peerStreamUserId,
    callType: 'default',
    callId,
  });
};
