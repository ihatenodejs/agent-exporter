import {Text} from 'ink';
import {useState, useEffect, useCallback, useRef} from 'react';
import React from 'react';

import {Dashboard} from './Dashboard';

import type {TimePeriod} from '../core/date-utils';
import type {UsageSummary} from '../core/statistics';
import type {ReactElement} from 'react';

interface DashboardContainerProps {
  readonly rangeDescription: string;
  readonly useRawLabels?: boolean;
  readonly fetchData: (
    isManualRefresh?: boolean,
    refreshIntervalSeconds?: number,
  ) => Promise<{
    summary: UsageSummary;
    lastUpdated: Date;
    isSyncing: boolean;
  }>;
  readonly onPeriodChange?: (period: TimePeriod) => void;
  readonly currentPeriod?: TimePeriod;
  readonly onExit: () => void;
}

export const DashboardContainer = ({
  rangeDescription,
  useRawLabels = false,
  fetchData,
  onPeriodChange,
  currentPeriod = 'monthly',
  onExit,
}: DashboardContainerProps): ReactElement => {
  const [data, setData] = useState<{
    summary: UsageSummary;
    lastUpdated: Date;
    isSyncing: boolean;
  } | null>(null);
  const [currentRangeDescription, setCurrentRangeDescription] =
    useState(rangeDescription);
  const [internalCurrentPeriod, setInternalCurrentPeriod] =
    useState(currentPeriod);
  const [isLoading, setIsLoading] = useState(true);
  const hasInitialized = useRef(false);

  const handleRefresh = useCallback(
    async (isManualRefresh = false, refreshIntervalSeconds = 30) => {
      setIsLoading(true);
      try {
        const newData = await fetchData(
          isManualRefresh,
          refreshIntervalSeconds,
        );
        setData(newData);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchData],
  );

  const handlePeriodChange = useCallback(
    (period: TimePeriod) => {
      setInternalCurrentPeriod(period);

      if (onPeriodChange) {
        onPeriodChange(period);
      }

      setTimeout(async () => {
        await handleRefresh();
        const {getDateRangeForPeriod, getDateRangeDescription} = await import(
          '../core/date-utils'
        );
        const range = getDateRangeForPeriod(period);
        setCurrentRangeDescription(
          getDateRangeDescription(range.start, range.end),
        );
      }, 0);
    },
    [onPeriodChange, handleRefresh],
  );

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      handleRefresh().catch(() => {
        // Ignore errors during initial load
      });
    }
  }, [handleRefresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      handleRefresh().catch(() => {
        // Ignore errors during auto-refresh
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [handleRefresh]);

  if (!data) {
    return React.createElement(Text, {}, 'Loading...');
  }

  return React.createElement(Dashboard, {
    summary: data.summary,
    rangeDescription: currentRangeDescription,
    useRawLabels,
    onRefresh: handleRefresh,
    onPeriodChange: handlePeriodChange,
    currentPeriod: internalCurrentPeriod,
    onExit,
    lastUpdated: data.lastUpdated,
    isSyncing: data.isSyncing,
    isLoading,
  });
};
