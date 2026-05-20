import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  const [eligibleIds, setEligibleIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const { data } = await profileApi.callerMessageEligibleReceivers();
      setEligibleIds(new Set(data.receiverIds));
    } catch {
      // Keep prior set on transient failures.
    } finally {
      setLoading(false);
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
