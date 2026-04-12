import 'express-serve-static-core';
import type { HydratedDocument } from 'mongoose';
import type { IUser } from '../models/User';
import type { IReceiver } from '../models/Receiver';
import type { IAdmin } from '../models/Admin';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set when JWT typ === `u` (app user / `users` collection) */
    user?: HydratedDocument<IUser>;
    /** Set when JWT typ === `r` (receiver / `receivers` collection) */
    receiver?: HydratedDocument<IReceiver>;
    /** Discriminator from JWT — required after `protect` succeeds */
    accountKind?: 'user' | 'receiver';
    admin?: HydratedDocument<IAdmin>;
  }
}
