import { useEffect, useState } from 'react';
import { Building2, FileText, Settings, User, X } from 'lucide-react';

import {
  updateReceiverProfile,
  type AdminReceiverUpdatePayload,
  type ReceiverRecord,
} from '../api/client';
import {
  isPresetProfileImage,
  resolveAdminProfileImageUrl,
} from '../utils/resolveProfileImageUrl';

type Props = {
  receiver: ReceiverRecord | null;
  onClose: () => void;
  onSaved?: () => void;
};

type EditTab = 'profile' | 'kyc' | 'bank' | 'status';

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    return String((err as { response?: { data?: { message?: string } } }).response?.data?.message) || fallback;
  }
  return fallback;
}

const RECEIVER_ONBOARDING_LANGUAGES = [
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Kannada',
  'Bengali',
  'Marathi',
];

const FEMALE_AVATARS = Array.from({ length: 27 }, (_, i) => `preset:female:${i + 1}`);

const POPULAR_INTERESTS = [
  'Friendship',
  'Relationships',
  'Lifestyle',
  'Travel',
  'Music',
  'Movies',
  'Fitness',
  'Food',
  'Fashion',
  'Dancing',
  'Career',
  'Confidence',
  'Art',
  'Sports',
  'Reading',
  'Technology',
  'Marriage',
  'Personal',
  'Education',
];

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Puducherry',
];

export function ReceiverEditModal({ receiver, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<EditTab>('profile');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    walletBalance: '',
    profileImage: '',
    userAudio: '',
    aadhaarNumber: '',
    panNumber: '',
    aadhaarFront: '',
    aadhaarBack: '',
    panFront: '',
    nameAsPerAadhaar: '',
    upiId: '',
    bankAccountHolderName: '',
    bankAccountType: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankName: '',
    languages: [] as string[],
    interests: [] as string[],
    gender: '',
    age: '',
    state: '',
    accountStatus: 'pending_profile',
    rejectionReason: '',
    voiceVerificationApproved: false,
    isVerified: false,
    isAvailable: false,
    suspended: false,
  });

  useEffect(() => {
    if (!receiver) return;
    setForm({
      name: receiver.name ?? '',
      phone: receiver.phone ?? '',
      walletBalance: String(receiver.walletBalance ?? 0),
      profileImage: receiver.profileImage ?? '',
      userAudio: receiver.userAudio ?? '',
      aadhaarNumber: receiver.aadhaarNumber ?? '',
      panNumber: receiver.panNumber ?? '',
      aadhaarFront: receiver.aadhaarFront ?? '',
      aadhaarBack: receiver.aadhaarBack ?? '',
      panFront: receiver.panFront ?? '',
      nameAsPerAadhaar: receiver.nameAsPerAadhaar ?? '',
      upiId: receiver.upiId ?? '',
      bankAccountHolderName: receiver.bankAccountHolderName ?? '',
      bankAccountType: receiver.bankAccountType ?? '',
      bankAccountNumber: receiver.bankAccountNumber ?? '',
      bankIfsc: receiver.bankIfsc ?? '',
      bankName: receiver.bankName ?? '',
      languages: Array.isArray(receiver.languages) ? [...receiver.languages] : [],
      interests: Array.isArray(receiver.interests) ? [...receiver.interests] : [],
      gender: receiver.gender ?? '',
      age: receiver.age != null ? String(receiver.age) : '',
      state: receiver.state ?? '',
      accountStatus: receiver.accountStatus ?? 'pending_profile',
      rejectionReason: receiver.rejectionReason ?? '',
      voiceVerificationApproved: Boolean(receiver.voiceVerificationApproved),
      isVerified: Boolean(receiver.isVerified),
      isAvailable: Boolean(receiver.isAvailable),
      suspended: Boolean(receiver.suspended),
    });
    setErr(null);
    setActiveTab('profile');
  }, [receiver]);

  const toggleLanguage = (lang: string) => {
    setForm((f) => {
      if (f.languages.includes(lang)) {
        return { ...f, languages: f.languages.filter((l) => l !== lang) };
      }
      if (f.languages.length >= 2) {
        return f; // Max 2 languages as per receiver app
      }
      return { ...f, languages: [...f.languages, lang] };
    });
  };

  const removeLanguage = (lang: string) => {
    setForm((f) => ({
      ...f,
      languages: f.languages.filter((l) => l !== lang),
    }));
  };

  const toggleInterest = (interest: string) => {
    setForm((f) => {
      if (f.interests.includes(interest)) {
        return { ...f, interests: f.interests.filter((i) => i !== interest) };
      }
      if (f.interests.length >= 3) {
        return f; // Max 3 interests allowed
      }
      return { ...f, interests: [...f.interests, interest] };
    });
  };

  const removeInterest = (interest: string) => {
    setForm((f) => ({
      ...f,
      interests: f.interests.filter((i) => i !== interest),
    }));
  };

  if (!receiver) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const walletBalance = parseInt(form.walletBalance, 10);
    if (Number.isNaN(walletBalance) || walletBalance < 0) {
      setErr('Wallet balance must be a non-negative whole number');
      setActiveTab('status');
      return;
    }

    const payload: AdminReceiverUpdatePayload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      walletBalance,
      userAudio: form.userAudio.trim() || null,
      state: form.state.trim() || null,
      nameAsPerAadhaar: form.nameAsPerAadhaar.trim() || null,
      upiId: form.upiId.trim() || null,
      bankAccountHolderName: form.bankAccountHolderName.trim() || null,
      bankAccountType: (form.bankAccountType as 'savings' | 'current') || null,
      bankAccountNumber: form.bankAccountNumber.trim() || null,
      bankIfsc: form.bankIfsc.trim().toUpperCase() || null,
      bankName: form.bankName.trim() || null,
      languages: form.languages,
      interests: form.interests,
      accountStatus: form.accountStatus,
      rejectionReason: form.rejectionReason.trim() || null,
      voiceVerificationApproved: form.voiceVerificationApproved,
      isVerified: form.isVerified,
      isAvailable: form.isAvailable,
      suspended: form.suspended,
    };

    const profileRaw = form.profileImage.trim();
    if (!isPresetProfileImage(profileRaw)) {
      payload.profileImage = profileRaw || null;
    } else if (profileRaw !== (receiver.profileImage ?? '').trim()) {
      payload.profileImage = profileRaw;
    }

    payload.aadhaarNumber = form.aadhaarNumber.trim() || null;
    payload.panNumber = form.panNumber.trim().toUpperCase() || null;
    payload.aadhaarFront = form.aadhaarFront.trim() || null;
    payload.aadhaarBack = form.aadhaarBack.trim() || null;
    payload.panFront = form.panFront.trim() || null;
    payload.gender = form.gender || null;

    if (form.age.trim()) {
      const age = parseInt(form.age, 10);
      if (Number.isNaN(age) || age < 18 || age > 120) {
        setErr('Age must be between 18 and 120');
        setActiveTab('profile');
        return;
      }
      payload.age = age;
    } else {
      payload.age = null;
    }

    setBusy(true);
    setErr(null);
    try {
      await updateReceiverProfile(receiver._id, payload);
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      setErr(apiError(e, 'Save failed'));
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: EditTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'profile', label: 'Profile Info', icon: User },
    { id: 'kyc', label: 'KYC & Docs', icon: FileText },
    { id: 'bank', label: 'Bank & Payout', icon: Building2 },
    { id: 'status', label: 'Status & Wallet', icon: Settings },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Edit receiver: {receiver.name}</h2>
            <p className="text-xs text-neutral-500">Edit profile, KYC documents, banking, and account settings</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-neutral-200 bg-neutral-50/80 px-6">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-[#7b2cff] text-[#7b2cff]'
                    : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {err ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                {err}
              </div>
            ) : null}

            {/* TAB 1: Profile Info */}
            {activeTab === 'profile' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">Name *</label>
                    <input
                      required
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
                      placeholder="Receiver name"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">Phone (10 digits) *</label>
                    <input
                      required
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
                      placeholder="10-digit mobile"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">Gender</label>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">— Unspecified —</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
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
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                      placeholder="18-120"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">State / Region</label>
                    <input
                      list="admin-receiver-indian-states"
                      value={form.state}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                      placeholder="Select or type state"
                    />
                    <datalist id="admin-receiver-indian-states">
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Languages Picker */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-bold text-neutral-800">
                        Languages ({form.languages.length}/2 selected)
                      </label>
                      <p className="text-xs text-neutral-500">
                        Select up to 2 languages (as per receiver onboarding).
                      </p>
                    </div>
                    {form.languages.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, languages: [] }))}
                        className="text-xs text-neutral-500 hover:text-red-600"
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  {/* Selected language chips */}
                  <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-xl border border-neutral-200 bg-white p-2">
                    {form.languages.length === 0 ? (
                      <span className="text-xs italic text-neutral-400">
                        No languages selected. Click language chips below (max 2).
                      </span>
                    ) : (
                      form.languages.map((lang) => (
                        <span
                          key={lang}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800"
                        >
                          {lang}
                          <button
                            type="button"
                            onClick={() => removeLanguage(lang)}
                            className="rounded p-0.5 hover:bg-violet-200 hover:text-violet-900"
                            title={`Remove ${lang}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {/* Language selection options */}
                  <div>
                    <div className="flex flex-wrap gap-1.5">
                      {RECEIVER_ONBOARDING_LANGUAGES.map((lang) => {
                        const isSelected = form.languages.includes(lang);
                        const isMaxReached = !isSelected && form.languages.length >= 2;
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => toggleLanguage(lang)}
                            disabled={isMaxReached}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                              isSelected
                                ? 'bg-[#7b2cff] text-white shadow-xs'
                                : isMaxReached
                                ? 'bg-neutral-100 text-neutral-400 border border-neutral-200 cursor-not-allowed opacity-60'
                                : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100'
                            }`}
                          >
                            {isSelected ? `✓ ${lang}` : `+ ${lang}`}
                          </button>
                        );
                      })}
                    </div>
                    {form.languages.length >= 2 && (
                      <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                        Maximum 2 languages selected. Deselect one to choose another.
                      </p>
                    )}
                  </div>
                </div>

                {/* Interests Picker */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-bold text-neutral-800">
                        Interests ({form.interests.length}/3 selected)
                      </label>
                      <p className="text-xs text-neutral-500">
                        Select up to 3 interests.
                      </p>
                    </div>
                    {form.interests.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, interests: [] }))}
                        className="text-xs text-neutral-500 hover:text-red-600"
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  {/* Selected interest chips */}
                  <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-xl border border-neutral-200 bg-white p-2">
                    {form.interests.length === 0 ? (
                      <span className="text-xs italic text-neutral-400">
                        No interests selected. Click interest chips below (max 3).
                      </span>
                    ) : (
                      form.interests.map((int) => (
                        <span
                          key={int}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1 text-xs font-semibold text-pink-800"
                        >
                          {int}
                          <button
                            type="button"
                            onClick={() => removeInterest(int)}
                            className="rounded p-0.5 hover:bg-pink-200 hover:text-pink-900"
                            title={`Remove ${int}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {/* Interest options */}
                  <div>
                    <div className="flex flex-wrap gap-1.5">
                      {POPULAR_INTERESTS.map((int) => {
                        const isSelected = form.interests.includes(int);
                        const isMaxReached = !isSelected && form.interests.length >= 3;
                        return (
                          <button
                            key={int}
                            type="button"
                            onClick={() => toggleInterest(int)}
                            disabled={isMaxReached}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                              isSelected
                                ? 'bg-pink-600 text-white shadow-xs'
                                : isMaxReached
                                ? 'bg-neutral-100 text-neutral-400 border border-neutral-200 cursor-not-allowed opacity-60'
                                : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100'
                            }`}
                          >
                            {isSelected ? `✓ ${int}` : `+ ${int}`}
                          </button>
                        );
                      })}
                    </div>
                    {form.interests.length >= 3 && (
                      <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                        Maximum 3 interests selected. Deselect one to choose another.
                      </p>
                    )}
                  </div>
                </div>

                {/* Profile Photo - Direct Visual Avatar Selection */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
                  <div>
                    <label className="text-sm font-bold text-neutral-800">Profile Photo</label>
                    <p className="text-xs text-neutral-500">
                      Select a receiver avatar photo from the gallery below ({FEMALE_AVATARS.length} available).
                    </p>
                  </div>

                  {/* Visual Avatar Grid */}
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2.5 shadow-inner">
                    <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
                      {FEMALE_AVATARS.map((presetId, idx) => {
                        const url = resolveAdminProfileImageUrl(presetId);
                        const isSelected = form.profileImage === presetId;
                        return (
                          <button
                            key={presetId}
                            type="button"
                            title={`Avatar #${idx + 1}`}
                            onClick={() => setForm((f) => ({ ...f, profileImage: presetId }))}
                            className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition-all focus:outline-none ${
                              isSelected
                                ? 'border-[#7b2cff] ring-2 ring-[#7b2cff] ring-offset-1 shadow-md scale-105 z-10'
                                : 'border-neutral-200 hover:border-[#7b2cff]/60 hover:scale-105'
                            }`}
                          >
                            {url ? (
                              <img
                                src={url}
                                alt={`Avatar ${idx + 1}`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-[10px] text-neutral-400">
                                #{idx + 1}
                              </div>
                            )}
                            {isSelected && (
                              <div className="absolute inset-0 flex items-center justify-center bg-[#7b2cff]/25 backdrop-blur-[0.5px]">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7b2cff] text-white text-[11px] font-bold shadow-md">
                                  ✓
                                </span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: KYC & Documents */}
            {activeTab === 'kyc' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">Aadhaar (12 digits)</label>
                    <input
                      value={form.aadhaarNumber}
                      onChange={(e) => setForm((f) => ({ ...f, aadhaarNumber: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                      placeholder="12-digit Aadhaar number"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">PAN Number</label>
                    <input
                      value={form.panNumber}
                      onChange={(e) => setForm((f) => ({ ...f, panNumber: e.target.value.toUpperCase() }))}
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm uppercase"
                      placeholder="e.g. ABCDE1234F"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-neutral-700">Aadhaar Front URL</label>
                  <input
                    value={form.aadhaarFront}
                    onChange={(e) => setForm((f) => ({ ...f, aadhaarFront: e.target.value }))}
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                    placeholder="https://..."
                  />
                  {form.aadhaarFront ? (
                    <a
                      href={form.aadhaarFront}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-[#7b2cff] hover:underline"
                    >
                      View uploaded image ↗
                    </a>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-neutral-700">Aadhaar Back URL</label>
                  <input
                    value={form.aadhaarBack}
                    onChange={(e) => setForm((f) => ({ ...f, aadhaarBack: e.target.value }))}
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                    placeholder="https://..."
                  />
                  {form.aadhaarBack ? (
                    <a
                      href={form.aadhaarBack}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-[#7b2cff] hover:underline"
                    >
                      View uploaded image ↗
                    </a>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-neutral-700">PAN Front URL</label>
                  <input
                    value={form.panFront}
                    onChange={(e) => setForm((f) => ({ ...f, panFront: e.target.value }))}
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                    placeholder="https://..."
                  />
                  {form.panFront ? (
                    <a
                      href={form.panFront}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-[#7b2cff] hover:underline"
                    >
                      View uploaded image ↗
                    </a>
                  ) : null}
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
                  <label className="block text-sm font-semibold text-neutral-700">Voice Verification Sample</label>
                  <input
                    value={form.userAudio}
                    onChange={(e) => setForm((f) => ({ ...f, userAudio: e.target.value }))}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm"
                    placeholder="https://... voice audio URL"
                  />
                  {form.userAudio ? (
                    <audio controls preload="none" src={form.userAudio} className="mt-2 w-full" />
                  ) : null}

                  <label className="flex items-center gap-2 pt-2 text-sm font-medium text-neutral-800">
                    <input
                      type="checkbox"
                      checked={form.voiceVerificationApproved}
                      onChange={(e) => setForm((f) => ({ ...f, voiceVerificationApproved: e.target.checked }))}
                      className="h-4 w-4 rounded border-neutral-300 text-[#7b2cff] focus:ring-[#7b2cff]"
                    />
                    Voice Gender Verification Passed
                  </label>
                </div>
              </div>
            )}

            {/* TAB 3: Bank & Payout */}
            {activeTab === 'bank' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">
                      Legal Name (as per Aadhaar)
                    </label>
                    <input
                      value={form.nameAsPerAadhaar}
                      onChange={(e) => setForm((f) => ({ ...f, nameAsPerAadhaar: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                      placeholder="Name for payout verification"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">UPI ID (VPA)</label>
                    <input
                      value={form.upiId}
                      onChange={(e) => setForm((f) => ({ ...f, upiId: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                      placeholder="e.g. name@okhdfcbank"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-4">
                  <h3 className="text-sm font-bold text-neutral-800">Bank Account Details</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-neutral-700">Account Holder Name</label>
                      <input
                        value={form.bankAccountHolderName}
                        onChange={(e) => setForm((f) => ({ ...f, bankAccountHolderName: e.target.value }))}
                        className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm"
                        placeholder="Holder name"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-neutral-700">Account Type</label>
                      <select
                        value={form.bankAccountType}
                        onChange={(e) => setForm((f) => ({ ...f, bankAccountType: e.target.value }))}
                        className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">— Select account type —</option>
                        <option value="savings">Savings</option>
                        <option value="current">Current</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-neutral-700">Account Number</label>
                      <input
                        value={form.bankAccountNumber}
                        onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
                        className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm"
                        placeholder="Bank account number"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-neutral-700">IFSC Code</label>
                      <input
                        value={form.bankIfsc}
                        onChange={(e) => setForm((f) => ({ ...f, bankIfsc: e.target.value.toUpperCase() }))}
                        className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm uppercase"
                        placeholder="e.g. HDFC0001234"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-neutral-700">Bank Name</label>
                      <input
                        value={form.bankName}
                        onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                        className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm"
                        placeholder="e.g. HDFC Bank"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Status & Wallet */}
            {activeTab === 'status' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">Account Status</label>
                    <select
                      value={form.accountStatus}
                      onChange={(e) => setForm((f) => ({ ...f, accountStatus: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold"
                    >
                      <option value="pending_profile">Pending Profile</option>
                      <option value="pending_review">Pending Review</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">Earnings Wallet (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      required
                      value={form.walletBalance}
                      onChange={(e) => setForm((f) => ({ ...f, walletBalance: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2"
                    />
                  </div>
                </div>

                {form.accountStatus === 'rejected' && (
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-neutral-700">Rejection Reason</label>
                    <textarea
                      rows={2}
                      value={form.rejectionReason}
                      onChange={(e) => setForm((f) => ({ ...f, rejectionReason: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                      placeholder="Reason for rejecting KYC / account..."
                    />
                  </div>
                )}

                <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
                  <h3 className="text-sm font-bold text-neutral-800">Account Flags</h3>
                  <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                    <input
                      type="checkbox"
                      checked={form.isVerified}
                      onChange={(e) => setForm((f) => ({ ...f, isVerified: e.target.checked }))}
                      className="h-4 w-4 rounded border-neutral-300 text-[#7b2cff] focus:ring-[#7b2cff]"
                    />
                    Phone Verified
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                    <input
                      type="checkbox"
                      checked={form.isAvailable}
                      onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
                      className="h-4 w-4 rounded border-neutral-300 text-[#7b2cff] focus:ring-[#7b2cff]"
                    />
                    Available for Calls (Receiver toggle)
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-red-700">
                    <input
                      type="checkbox"
                      checked={form.suspended}
                      onChange={(e) => setForm((f) => ({ ...f, suspended: e.target.checked }))}
                      className="h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-500"
                    />
                    Suspended (Block receiver app access)
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-6 py-4">
            <div className="text-xs text-neutral-400">
              Editing: <span className="font-semibold text-neutral-600">{receiver.phone}</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[#7b2cff] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#6a24df] disabled:opacity-50"
              >
                {busy ? 'Saving changes…' : 'Save all changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
