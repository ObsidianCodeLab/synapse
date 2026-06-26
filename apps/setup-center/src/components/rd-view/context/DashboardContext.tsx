import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { fetchIwhalecloudUserinfoSummary } from '@/api/rdUnifiedService';
import { fetchRdViewTeamOverviewWithComparison } from '@rd-view/api/rdViewService';
import {
  buildRdViewDashboardWithTrend,
  type RdViewDashboardResult,
  type RdViewDemandsPayload,
} from '@rd-view/data/buildOrderEfficiencyDetail';
import type { RdViewCurrentUser, TimeRange } from '@rd-view/types';

interface DashboardState {
  timeRange: TimeRange;
}

interface DashboardContextType {
  state: DashboardState;
  setTimeRange: (range: TimeRange) => void;
  dashboard: RdViewDashboardResult;
  currentUser: RdViewCurrentUser | null;
  synapseApiBase: string;
  loading: boolean;
  error: string | null;
  refreshDashboard: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

const EMPTY_DASHBOARD_PAYLOAD: RdViewDemandsPayload = { code: 0, data: [] };

export function DashboardProvider({
  synapseApiBase,
  children,
}: {
  synapseApiBase: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<DashboardState>({
    timeRange: 'week',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawPayload, setRawPayload] = useState<RdViewDemandsPayload>(EMPTY_DASHBOARD_PAYLOAD);
  const [previousPayload, setPreviousPayload] = useState<RdViewDemandsPayload>(EMPTY_DASHBOARD_PAYLOAD);
  const [currentUser, setCurrentUser] = useState<RdViewCurrentUser | null>(null);

  const loadCurrentUser = useCallback(async () => {
    if (!synapseApiBase?.trim()) {
      setCurrentUser(null);
      return;
    }
    try {
      const owner = await fetchIwhalecloudUserinfoSummary(synapseApiBase);
      const employeeId = String(owner.employee_id ?? '').trim();
      if (owner.exists && employeeId) {
        setCurrentUser({
          employeeId,
          name: String(owner.name ?? '').trim(),
        });
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    }
  }, [synapseApiBase]);

  const loadDashboard = useCallback(async () => {
    if (!synapseApiBase?.trim()) {
      setError('synapse_api_base_missing');
      setRawPayload(EMPTY_DASHBOARD_PAYLOAD);
      setPreviousPayload(EMPTY_DASHBOARD_PAYLOAD);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { current, previous } = await fetchRdViewTeamOverviewWithComparison(
        synapseApiBase,
        state.timeRange,
      );
      setRawPayload(current);
      setPreviousPayload(previous);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setRawPayload(EMPTY_DASHBOARD_PAYLOAD);
      setPreviousPayload(EMPTY_DASHBOARD_PAYLOAD);
    } finally {
      setLoading(false);
    }
  }, [synapseApiBase, state.timeRange]);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const dashboard = useMemo(
    () => buildRdViewDashboardWithTrend(rawPayload, previousPayload, state.timeRange),
    [rawPayload, previousPayload, state.timeRange],
  );

  const setTimeRange = useCallback((range: TimeRange) => {
    setState((prev) => ({ ...prev, timeRange: range }));
  }, []);

  const refreshDashboard = useCallback(async () => {
    await Promise.all([loadDashboard(), loadCurrentUser()]);
  }, [loadDashboard, loadCurrentUser]);

  return (
    <DashboardContext.Provider
      value={{
        state,
        setTimeRange,
        dashboard,
        currentUser,
        synapseApiBase,
        loading,
        error,
        refreshDashboard,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextType {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
