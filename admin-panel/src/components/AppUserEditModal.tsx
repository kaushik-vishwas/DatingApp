import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { updateAppUserProfile, type AppUserRecord, type AdminAppUserUpdatePayload } from '../api/client';
import { ProfileImagePreview } from './ProfileImagePreview';
import { isPresetProfileImage } from '../utils/resolveProfileImageUrl';

type Props = {
  user: AppUserRecord | null;
  onClose: () => void;
  onSaved?: () => void;
};

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    return String((err as { response?: { data?: { message?: string } } }).response?.data?.message) || fallback;
  }
  return fallback;
}

export function AppUserEditModal({ user, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    walletBalance: '',
    profileImage: '',
    userAudio: '',
    gender: '',
    age: '',
    state: '',
    suspended: false,
  });

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      phone: user.phone,
      walletBalance: String(user.walletBalance ?? 0),
      profileImage: user.profileImage ?? '',
      userAudio: user.userAudio ?? '',
      gender: user.gender ?? '',
      age: user.age != null ? String(user.age) : '',
      state: user.state ?? '',
      suspended: Boolean(user.suspended),
    });
    setErr(null);
  }, [user]);

  if (!user) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const walletBalance = parseInt(form.walletBalance, 10);
    if (Number.isNaN(walletBalance) || walletBalance < 0) {
      setErr('Wallet balance must be a non-negative whole number');
      return;
    }

    const payload: AdminAppUserUpdatePayload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      walletBalance,
      userAudio: form.userAudio.trim() || null,
      suspended: form.suspended,
      state: form.state.trim() || null,
    };

    const profileRaw = form.profileImage.trim();
    if (!isPresetProfileImage(profileRaw)) {
      payload.profileImage = profileRaw || null;
    } else if (profileRaw !== (user.profileImage ?? '').trim()) {
      payload.profileImage = profileRaw;
    }

    if (form.gender) payload.gender = form.gender;
    if (form.age.trim()) {
      const age = parseInt(form.age, 10);
      if (Number.isNaN(age) || age < 18 || age > 120) {
        setErr('Age must be between 18 and 120');
        return;
      }
      payload.age = age;
    }

    setBusy(true);
    setErr(null);
    try {
      await updateAppUserProfile(user._id, payload);
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      setErr(apiError(e, 'Save failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-neutral-900">Edit user</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-neutral-100">
            <X className="h-5 w-5 text-neutral-500" />
          </button>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">Phone</label>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">Wallet (₹)</label>
            <input
              type="number"
              min={0}
              step={1}
              required
              value={form.walletBalance}
              onChange={(e) => setForm((f) => ({ ...f, walletBalance: e.target.value }))}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-neutral-700">Gender</label>
              <select
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-neutral-700">Age</label>
              <input
                type="number"
                min={18}
                max={120}
                value={form.age}
                onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">State</label>
            <input
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">Profile image</label>
            <ProfileImagePreview profileImage={form.profileImage} alt={form.name} className="mb-2" />
            <input
              value={form.profileImage}
              onChange={(e) => setForm((f) => ({ ...f, profileImage: e.target.value }))}
              placeholder={isPresetProfileImage(form.profileImage) ? 'preset:female:15' : 'https://…'}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
            />
            {/* {isPresetProfileImage(form.profileImage) ? (
              <p className="mt-1 text-xs text-neutral-500">
                Bundled avatar id from the app — preview above. Use a https:// URL to replace with a custom photo.
              </p>
            ) : null} */}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">Voice sample URL</label>
            <input
              value={form.userAudio}
              onChange={(e) => setForm((f) => ({ ...f, userAudio: e.target.value }))}
              placeholder="https://…"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
            <input
              type="checkbox"
              checked={form.suspended}
              onChange={(e) => setForm((f) => ({ ...f, suspended: e.target.checked }))}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Suspended (inactive access)
          </label>

          {err ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {err}
            </p>
          ) : null}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-xl bg-[#7b2cff] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6a24df] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
