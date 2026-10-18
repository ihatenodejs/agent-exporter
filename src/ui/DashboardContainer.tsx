import {Text} from 'ink';
import {useState, useEffect, useCallback, useRef} from 'react';
import React from 'react';

import {Dashboard} from './Dashboard';

import type {TimePeriod} from '../core/date-utils';
import type {UsageSummary} from '../core/statistics';
import type {ReactElement} from 'react';

interface DashboardContainerProps {
  readonly getRangeDescription: () => string;
  readonly useRawLabels?: boolean;
  readonly fetchData: (
    isManualRefresh?: boolean,
    refreshIntervalSeconds?: number,
  ) => Promise<{
    summary: UsageSummary;
    lastUpdated: Date;
    isSyncing: boolean;
    canNavigatePrevious: boolean;
    canNavigateNext: boolean;
  }>;
  readonly onPeriodChange?: (period: TimePeriod) => void;
  readonly onPeriodNavigate?: (direction: 'previous' | 'next') => void;
  readonly currentPeriod?: TimePeriod;
  readonly onExit: () => void;
}

export const DashboardContainer = ({
  getRangeDescription,
  useRawLabels = false,
  fetchData,
  onPeriodChange,
  onPeriodNavigate,
  currentPeriod = 'monthly',
  onExit,
}: DashboardContainerProps): ReactElement => {
  const [data, setData] = useState<{
    summary: UsageSummary;
    lastUpdated: Date;
    isSyncing: boolean;
    canNavigatePrevious: boolean;
    canNavigateNext: boolean;
  } | null>(null);
  const [currentRangeDescription, setCurrentRangeDescription] =
    useState(getRangeDescription);
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
        setCurrentRangeDescription(getRangeDescription());
      } finally {
        setIsLoading(false);
      }
    },
    [fetchData],
  );

  const handlePeriodChange = useCallback(
    async (period: TimePeriod) => {
      try {
        setInternalCurrentPeriod(period);

        if (onPeriodChange) {
          onPeriodChange(period);
        }

        await handleRefresh();
      } catch (error) {
        console.error('Error during period change:', error);
      }
    },
    [onPeriodChange, handleRefresh],
  );

  const handlePeriodNavigate = useCallback(
    async (direction: 'previous' | 'next') => {
      try {
        onPeriodNavigate?.(direction);
        await handleRefresh();
      } catch (error) {
        console.error('Error during period navigation:', error);
      }
    },
    [onPeriodNavigate, handleRefresh],
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
    onPeriodNavigate: handlePeriodNavigate,
    currentPeriod: internalCurrentPeriod,
    canNavigatePrevious: data.canNavigatePrevious,
    canNavigateNext: data.canNavigateNext,
    onExit,
    lastUpdated: data.lastUpdated,
    isSyncing: data.isSyncing,
    isLoading,
  });
};
