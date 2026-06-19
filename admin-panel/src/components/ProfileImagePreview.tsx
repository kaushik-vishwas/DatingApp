import {
  isPresetProfileImage,
  resolveAdminProfileImageUrl,
} from '../utils/resolveProfileImageUrl';

type Props = {
  profileImage: string | null | undefined;
  alt?: string;
  className?: string;
  /** Bust CDN/browser cache when profile was updated (e.g. receiver `updatedAt`). */
  cacheKey?: string | null;
};

/** Shows preset or HTTPS profile photos in admin UI; raw preset ids are not used as link targets. */
export function ProfileImagePreview({ profileImage, alt = 'Profile', className, cacheKey }: Props) {
  const displayUrl = resolveAdminProfileImageUrl(profileImage, cacheKey);
  if (!displayUrl) return null;

  const stored = profileImage?.trim() ?? '';

  return (
    <div className={className ?? 'mt-3'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Profile photo</p>
      <a
        href={displayUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block overflow-hidden rounded-xl ring-1 ring-neutral-200"
      >
        <img src={displayUrl} alt={alt} className="h-28 w-28 object-cover" />
      </a>
      {isPresetProfileImage(stored) ? (
        <p className="mt-1 text-xs text-neutral-500">
          Bundled avatar <span className="font-mono text-neutral-600">{stored}</span>
        </p>
      ) : null}
    </div>
  );
}
