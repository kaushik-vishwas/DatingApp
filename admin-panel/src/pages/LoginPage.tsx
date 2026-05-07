import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { KeyRound, LogIn } from 'lucide-react';
import { adminForgotPassword, adminLogin, adminResetPassword } from '../api/client';
import { useAdminAuth } from '../context/AdminAuthContext';

export function LoginPage() {
  const { signIn, token, bootstrapping } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? '/overview';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [showForgot, setShowForgot] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  if (!bootstrapping && token) {
    return <Navigate to="/overview" replace />;
  }

  const onSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setResetMsg(null);
    setError(null);
    setLoginLoading(true);
    try {
      const data = await adminLogin(email.trim(), password);
      signIn(data.token, data.admin);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Login failed';
      setError(msg || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const onSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    setResetMsg(null);
    setError(null);
    setResetLoading(true);
    try {
      const data = await adminForgotPassword(email.trim());
      setResetMsg(data.message);
      setOtpSent(true);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Failed to send code';
      setError(msg || 'Failed to send code');
    } finally {
      setResetLoading(false);
    }
  };

  const onResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setResetMsg(null);
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setResetLoading(true);
    try {
      const data = await adminResetPassword(otp.trim(), newPassword, confirmPassword);
      signIn(data.token, data.admin);
      setResetMsg(data.message);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Failed to reset password';
      setError(msg || 'Failed to reset password');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg shadow-neutral-200/80">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#ff72d2] text-xl font-black text-white">
            S
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Selecto Admin</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in with your admin email and password</p>
        </div>

        <form onSubmit={onSignIn} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-neutral-700">
              Gmail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none ring-[#7b2cff]/30 focus:border-[#7b2cff] focus:ring-2"
              placeholder=""
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-neutral-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none ring-[#7b2cff]/30 focus:border-[#7b2cff] focus:ring-2"
              placeholder=""
              required
            />
          </div>

          <button
            type="submit"
            disabled={loginLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff72d2] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ff5ec8] disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {loginLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setShowForgot((prev) => !prev);
            setOtpSent(false);
            setOtp('');
            setNewPassword('');
            setConfirmPassword('');
            setResetMsg(null);
            setError(null);
          }}
          className="mt-3 text-sm text-[#7b2cff] hover:underline"
        >
          Forgot password?
        </button>

        {showForgot ? (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <KeyRound className="h-4 w-4 text-[#7b2cff]" />
              Reset password
            </div>
            {!otpSent ? (
              <form onSubmit={onSendOtp} className="mt-3">
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full rounded-xl bg-[#7b2cff] py-2.5 text-sm font-semibold text-white hover:bg-[#6a24df] disabled:opacity-60"
                >
                  {resetLoading ? 'Sending code…' : 'Send code to this Gmail'}
                </button>
              </form>
            ) : (
              <form onSubmit={onResetPassword} className="mt-3 space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#7b2cff]/30 focus:border-[#7b2cff] focus:ring-2"
                  placeholder="Enter code from email"
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#7b2cff]/30 focus:border-[#7b2cff] focus:ring-2"
                  placeholder="New password"
                  minLength={8}
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#7b2cff]/30 focus:border-[#7b2cff] focus:ring-2"
                  placeholder="Confirm new password"
                  minLength={8}
                  required
                />
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full rounded-xl bg-[#7b2cff] py-2.5 text-sm font-semibold text-white hover:bg-[#6a24df] disabled:opacity-60"
                >
                  {resetLoading ? 'Saving…' : 'Update password'}
                </button>
              </form>
            )}
            {resetMsg ? <p className="mt-3 text-xs text-green-700">{resetMsg}</p> : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <p className="mt-6 text-center text-xs text-neutral-400">
          Default admin is <code className="rounded bg-neutral-100 px-1"></code> with{' '}
          <code className="rounded bg-neutral-100 px-1"></code> (from env defaults). Change these in the backend{' '}
          <code className="rounded bg-neutral-100 px-1">.env</code> file.
        </p>
      </div>
    </div>
  );
}
