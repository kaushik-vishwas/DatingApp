# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the `backend/` package of a monorepo (`../frontend` = Expo React Native app, `../admin-panel` = Vite admin UI, `../landing-sites`, `../config`). It is an Express + Mongoose + Socket.IO API (TypeScript, CommonJS output) for a paid voice-call / chat app where **callers** pay per minute/message to talk to **receivers**. PM2 app names use the brand "selecto".

## Commands

```bash
npm run dev          # ts-node-dev, loads backend/.env (production profile)
npm run dev:test     # same, with APP_ENV=test → loads backend/.env.test
npm run typecheck    # tsc --noEmit (the only static check; there is no linter or test suite)
npm run build        # tsc → dist/, then copies ../config/referralLanding.json into dist/config/
npm start            # prestart runs build, then node dist/server.js
npm run pm2:restart  # build + pm2 restart ecosystem.config.cjs (prod :5000 and test :5001 on one host)
```

One-off scripts in `scripts/` run with `tsx` (e.g. `npm run seed:admin`, `npm run migrate:*`, `npx tsx scripts/creditMissedRazorpayPayments.ts`). They import `config/bootstrapEnv` first, so set `APP_ENV=test` to target the test DB.

Health check: `GET /health` returns the loaded env profile, port, and env-file path.

## Environment loading

- `config/loadEnv.ts` picks exactly one env file per process: `DOTENV_CONFIG_PATH` → `.env.test` if `APP_ENV`/`ENVIRONMENT`/`NODE_ENV` is `test` → `.env`. It then monkey-patches `dotenv.config` to block reloads. `import './config/bootstrapEnv'` must stay the **first import** in `server.ts` and scripts.
- The root `README.md` is outdated: it says env lives at the project root, but the backend reads `backend/.env` / `backend/.env.test`.
- `OTP_BYPASS=true` skips SMS and accepts any OTP (dev only). `WALLET_ALLOW_MOCK_CREDIT` enables fake wallet top-ups.
- Integrations configured via env: Razorpay (wallet top-ups plus webhook), RazorpayX (receiver payouts), Stream (voice calls; `utils/streamVoice.ts` signs Stream user JWTs), FCM v1 and Expo Push (incoming-call wake and broadcasts), MessageCentral (SMS OTP), Nodemailer/Gmail.

## Architecture

**Two account collections, one JWT secret.** `models/User.ts` holds callers (app members). `models/Receiver.ts` holds call receivers. They were split from a single `users` collection (`scripts/migrateSplitUsersReceivers.ts`). App JWTs carry `typ: 'u' | 'r'`. `middleware/auth.ts` `protect` loads the right model and sets `req.user` **or** `req.receiver`, plus `req.accountKind` (see `types/express.d.ts`). Handlers must branch on `accountKind`. Admins are separate: `models/Admin.ts`, `ADMIN_JWT_SECRET`, `middleware/adminAuth.ts` (`adminProtect`), JWT `typ: 'admin'`. The super admin is synced from env on boot (`services/superAdminSync.ts`).

**Single-device sessions.** Each account has `authSessionVersion`. The JWT embeds it, and `protect` rejects a mismatch with `PROTECT_SESSION_SUPERSEDED`. A new login bumps the version and emits `auth:session_superseded` over the socket (`services/authSessionService.ts`, `socket/socketRegistry.ts`).

**Layering:** `routes/*` → `controllers/*` (large: `profileController`, `adminController`, `authController`) → `services/*` and `utils/*` → `models/*`. Business constants (pricing, fees, wallet packages, referral rewards) live in `constants/`. The `.js` files beside some `.ts` files (`controllers/authController.js`, `middleware/auth.js`, `routes/authRoutes.js`, `config/database.js`, `config/email.js`) are legacy leftovers from the first commit. Edit the `.ts` versions.

**Real-time and calls (the most intricate part):**
- `socket/chatSocket.ts` is the Socket.IO server. It authenticates with the same app JWT, joins `account:{u|r}:{id}` rooms, and handles chat messages and typing (rooms `chat:{userId}:{receiverId}`, per-message charge/earn from `constants/chatPricing.ts`). It also runs the call signalling state machine: invite → ring → accept/decline/no-answer timeouts, hold, mute, keepalive, end. `socket/socketRegistry.ts` holds the `io` singleton and the emit helpers used by controllers, including the admin notifications room.
- `services/callQueue.ts` keeps **in-memory** receiver state (waiting/busy/queue-active sets) and mirrors part of it to the DB (`isBusyOnCall`). `services/callInviteRegistry.ts` tracks pending invites in memory. Both assume a single process (PM2 `fork`, 1 instance). Don't scale horizontally without moving this state out of process.
- `services/receiverPresence.ts` decides receiver discoverability (foreground/background presence, a 24h discover grace window). `services/pendingIncomingCall.ts` plus `fcmV1IncomingCall.ts` / `expoPush.ts` wake backgrounded receivers.
- `controllers/callController.ts` owns `CallSession` lifecycle and billing. `settleCallSession` / `ensureCallEndedAndSettled` compute talk duration, debit the caller's wallet, and credit receiver earnings (`utils/receiverCallEarnings.ts`, `services/receiverEarningModel.ts`). Calls under `MISSED_OR_INCOMPLETE_MAX_SEC` are treated as missed/incomplete. The voice media goes through Stream. The backend only issues tokens and tracks sessions.

**Money flows:** caller wallet top-ups go through Razorpay (`controllers/walletController.ts`; `WalletTopup` and `WalletCredit` models). The webhook at `/wallet/razorpay-webhook` verifies HMAC against `req.rawBody`, which is captured in the `express.json` `verify` hook in `server.ts`, so keep that hook intact. Receiver withdrawals go through RazorpayX payouts (`services/razorpayXPayoutService.ts`, `WithdrawalRequest`). Admin earnings reporting is in `services/adminEarningsService.ts`.

**Errors and tracing:** protected routes set a trace-id response header (`utils/apiTraceLog.ts`), and the error handler returns `{ traceId, message, error }`. Error responses use machine-readable `error` codes (e.g. `PROTECT_*`) that the frontend matches on, so keep existing codes stable.

**Boot sequence** (`server.ts`): connect Mongo → `dropLegacyEmailIndexes` → `syncSuperAdminFromEnv` → verify SMTP (non-blocking) → listen on `0.0.0.0:PORT`.
