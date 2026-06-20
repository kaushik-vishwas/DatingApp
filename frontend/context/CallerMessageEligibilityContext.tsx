import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { profileApi } from '../services/api';

type CallerMessageEligibilityContextValue = {
  loading: boolean;
  canMessageReceiver: (receiverId: string) => boolean;
  refresh: () => Promise<void>;
};

const CallerMessageEligibilityContext =
  createContext<CallerMessageEligibilityContextValue | null>(null);

export const CallerMessageEligibilityProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const REFRESH_THROTTLE_MS = 10_000;
  const [eligibleIds, setEligibleIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const lastLoadedAtRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const now = Date.now();
    if (inFlightRef.current) {
      await inFlightRef.current;
      return;
    }
    if (now - lastLoadedAtRef.current < REFRESH_THROTTLE_MS) {
      setLoading(false);
      return;
    }
    const request = (async () => {
      try {
        const { data } = await profileApi.callerMessageEligibleReceivers();
        setEligibleIds(new Set(data.receiverIds));
        lastLoadedAtRef.current = Date.now();
      } catch {
        // Keep prior set on transient failures.
      } finally {
        setLoading(false);
      }
    })();
    inFlightRef.current = request;
    try {
      await request;
    } finally {
      inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canMessageReceiver = useCallback(
    (receiverId: string) => eligibleIds.has(receiverId),
    [eligibleIds]
  );

  const value = useMemo(
    () => ({ loading, canMessageReceiver, refresh }),
    [loading, canMessageReceiver, refresh]
  );

  return (
    <CallerMessageEligibilityContext.Provider value={value}>
      {children}
    </CallerMessageEligibilityContext.Provider>
  );
};

export const useCallerMessageEligibility = (): CallerMessageEligibilityContextValue => {
  const ctx = useContext(CallerMessageEligibilityContext);
  if (!ctx) {
    throw new Error(
      'useCallerMessageEligibility must be used within CallerMessageEligibilityProvider'
    );
  }
  return ctx;
};

/** Safe on screens shared with receiver app (e.g. voice call). */
export const useCallerMessageEligibilityOptional =
  (): CallerMessageEligibilityContextValue | null =>
    useContext(CallerMessageEligibilityContext);
