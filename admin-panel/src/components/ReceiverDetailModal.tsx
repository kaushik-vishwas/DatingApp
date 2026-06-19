import { Pencil } from 'lucide-react';

import type { ReceiverRecord } from '../api/client';
import { ProfileImagePreview } from './ProfileImagePreview';
import { resolveAdminProfileImageUrl } from '../utils/resolveProfileImageUrl';

type Props = {
  receiver: ReceiverRecord | null;
  onClose: () => void;
  onEdit?: (receiver: ReceiverRecord) => void;
};

export function ReceiverDetailModal({ receiver, onClose, onEdit }: Props) {
  if (!receiver) return null;

  const profileUrl = resolveAdminProfileImageUrl(receiver.profileImage, receiver.updatedAt);
  const docs = [
    { label: 'Profile', url: profileUrl },
    { label: 'Aadhaar front', url: receiver.aadhaarFront },
    { label: 'Aadhaar back', url: receiver.aadhaarBack },
    { label: 'PAN front', url: receiver.panFront },
  ].filter((d) => d.url);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{receiver.name}</h2>
            {receiver.email ? <p className="mt-1 text-sm text-neutral-500">{receiver.email}</p> : null}
            <p className="text-sm text-neutral-500">{receiver.phone}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
          >
            Close
          </button>
        </div>

        <ProfileImagePreview
          profileImage={receiver.profileImage}
          alt={receiver.name}
          className="mt-4"
          cacheKey={receiver.updatedAt}
        />

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Account</dt>
            <dd className="font-medium text-neutral-900">Call receiver</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Account status</dt>
            <dd className="font-medium text-neutral-900">{receiver.accountStatus}</dd>
          </div>
          {receiver.aadhaarNumber ? (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Aadhaar number</dt>
              <dd className="font-medium text-neutral-900">{receiver.aadhaarNumber}</dd>
            </div>
          ) : null}
          {receiver.panNumber ? (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">PAN number</dt>
              <dd className="font-medium text-neutral-900">{receiver.panNumber}</dd>
            </div>
          ) : null}
          {receiver.nameAsPerAadhaar ? (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Name (as per Aadhaar)</dt>
              <dd className="font-medium text-neutral-900">{receiver.nameAsPerAadhaar}</dd>
            </div>
          ) : null}
          {receiver.upiId ? (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">UPI ID</dt>
              <dd className="font-medium text-neutral-900">{receiver.upiId}</dd>
            </div>
          ) : null}
          {typeof receiver.audioCallRate === 'number' && Number.isFinite(receiver.audioCallRate) ? (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Audio call rate</dt>
              <dd className="font-medium text-neutral-900">₹{receiver.audioCallRate}/min</dd>
            </div>
          ) : null}
        </dl>

        {docs.length > 0 ? (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Documents</p>
            <ul className="mt-2 space-y-2">
              {docs.map((d) => (
                <li key={d.label}>
                  <a
                    href={d.url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-[#7b2cff] hover:underline"
                  >
                    Open {d.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-6 text-sm text-neutral-500">No document URLs on file.</p>
        )}

        {onEdit ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => onEdit(receiver)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              <Pencil className="h-4 w-4" />
              Edit receiver
            </button>
          </div>
        ) : null}

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Voice sample</p>
          {receiver.userAudio ? (
            <div className="mt-2">
              <audio controls preload="none" src={receiver.userAudio} className="w-full" />
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">No voice verification audio on file.</p>
          )}
        </div>
      </div>
    </div>
  );
}
