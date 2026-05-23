import { createContext, useContext, useState, useCallback } from 'react';

interface MissionJobContextValue {
  activeJobId: string | null;
  openMissionJob: (jobId: string) => void;
  closeMissionJob: () => void;
}

const MissionJobContext = createContext<MissionJobContextValue>({
  activeJobId: null,
  openMissionJob: () => {},
  closeMissionJob: () => {},
});

export function useMissionJob() {
  return useContext(MissionJobContext);
}

export function MissionJobProvider({ children }: { children: React.ReactNode }) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const openMissionJob = useCallback((jobId: string) => {
    setActiveJobId(jobId);
  }, []);

  const closeMissionJob = useCallback(() => {
    setActiveJobId(null);
  }, []);

  return (
    <MissionJobContext.Provider value={{ activeJobId, openMissionJob, closeMissionJob }}>
      {children}
    </MissionJobContext.Provider>
  );
}
