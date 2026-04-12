# Dating app — email OTP auth (Expo + Express)

Full-stack JWT auth: register with name/email/phone, log in with email + 6-digit OTP (Nodemailer / Gmail).

## Project layout

- `backend/` — Node.js, Express, Mongoose, JWT, Nodemailer
- `frontend/` — Expo (React Native), React Navigation, Axios, AsyncStorage

## 1. Backend

### Prerequisites

- Node.js 18+
- MongoDB running locally or a connection string (Atlas)

### Setup

Use the **single** `.env` at the **project root** (`dating-app-auth/.env`). It lists backend keys, admin panel `VITE_*` values, and commented Expo keys for the mobile app.

Edit that file:

- `MONGODB_URI` — e.g. `mongodb://127.0.0.1:27017/dating_app_auth`
- `EMAIL_USER` — Gmail address
- `EMAIL_PASS` — [Gmail App Password](https://support.google.com/accounts/answer/185833) (not your normal password)
- `JWT_SECRET` — long random string
- `PORT` — default `5000`
- `ADMIN_EMAIL`, `ADMIN_JWT_SECRET` — admin API (see admin panel)
- `VITE_API_URL` — admin panel API base URL (e.g. `http://localhost:5000`)

For Expo, copy the `EXPO_PUBLIC_*` lines from the root `.env` comments into `frontend/.env` as needed.

### Run

```powershell
npm install
npm run dev
```

Health check: `http://localhost:5000/health`

**Testing OTP without relying on email:** the server logs every OTP, for example:

`[OTP TEST] user@example.com → OTP: 123456 (expires ...)`

### API summary

| Method | Path | Body / auth | Description |
|--------|------|-------------|-------------|
| POST | `/auth/register` | `{ name, email, phone }` | Create user |
| POST | `/auth/send-otp` | `{ email }` | User must exist; sends OTP |
| POST | `/auth/verify-otp` | `{ email, otp }` | Returns JWT |
| GET | `/auth/me` | `Authorization: Bearer <jwt>` | Current user |

## 2. Frontend (Expo)

### Setup

```powershell
cd frontend
npm install
```

### API base URL

- **iOS simulator / web (same machine):** default `http://localhost:5000` works.
- **Android emulator:** the app uses `http://10.0.2.2:5000` in development.
- **Physical phone:** use your PC’s LAN IP, e.g. `http://192.168.1.50:5000`.

Set in `frontend/app.json` under `expo.extra`:

```json
"extra": {
  "apiBaseUrl": "http://YOUR_LAN_IP:5000"
}
```

Restart Expo after changing `app.json`.

### Run

```powershell
npm start
```

Then press `a` / `i` / `w` for Android, iOS, or web.

## 3. Integration checklist

1. Start MongoDB.
2. Configure the project root `.env` (especially `EMAIL_*`, `JWT_SECRET`, and `MONGODB_URI`).
3. Start backend: `npm run dev` in `backend/`.
4. From a device/emulator, ensure `apiBaseUrl` (or defaults) reaches the server (firewall allows port 5000).
5. **Flow:** Log in (email + optional mobile) → Send OTP → if account missing, app opens Register → OTP is sent → Verify OTP → Home shows `GET /auth/me` data.

## 4. Troubleshooting

- **“No account for this email”** on Send OTP — app will open Register automatically; OTP is sent after successful registration.
- **502 on Send OTP** — Gmail credentials wrong or “Less secure app” / App Password not set; OTP is still printed in the server console for testing.
- **Network error on phone** — set `expo.extra.apiBaseUrl` to `http://<your-computer-ip>:5000` and use `http` (not `https`) for local dev.
