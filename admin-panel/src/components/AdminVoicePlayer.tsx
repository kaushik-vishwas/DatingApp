import { useEffect, useRef } from 'react';

type Props = {
  src: string;
  className?: string;
};

/**
 * Native controls stay at 0:00 when metadata is not loaded, and some Cloudinary
 * voice files report an infinite duration until the playhead is seeked once.
 */
export function AdminVoicePlayer({ src, className }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let probing = false;

    const durationReady = () => Number.isFinite(audio.duration) && audio.duration > 0;

    const finishProbe = () => {
      if (!probing || !durationReady()) return;
      probing = false;
      if (audio.paused && audio.currentTime > 0) audio.currentTime = 0;
    };

    const onLoadedMetadata = () => {
      if (durationReady() || probing) return;
      probing = true;
      try {
        audio.currentTime = 1e101;
      } catch {
        probing = false;
      }
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', finishProbe);
    audio.addEventListener('timeupdate', finishProbe);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', finishProbe);
      audio.removeEventListener('timeupdate', finishProbe);
    };
  }, [src]);

  return <audio ref={audioRef} controls preload="metadata" src={src} className={className} />;
}
