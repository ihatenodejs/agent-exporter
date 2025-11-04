import {useState, useEffect, useCallback} from 'react';
import React from 'react';

import {Dashboard} from './Dashboard';

import type {TimePeriod} from '../core/date-utils';
import type {UsageSummary} from '../core/statistics';
import type {ReactElement} from 'react';

interface DashboardContainerProps {
  readonly rangeDescription: string;
  readonly useRawLabels?: boolean;
  readonly fetchData: () => {summary: UsageSummary; lastUpdated: Date};
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
  const [data, setData] = useState(() => fetchData());
  const [currentRangeDescription, setCurrentRangeDescription] =
    useState(rangeDescription);
  const [internalCurrentPeriod, setInternalCurrentPeriod] =
    useState(currentPeriod);

  const handleRefresh = useCallback(() => {
    const newData = fetchData();
    setData(newData);
  }, [fetchData]);

  const handlePeriodChange = useCallback(
    (period: TimePeriod) => {
      setInternalCurrentPeriod(period);

      if (onPeriodChange) {
        onPeriodChange(period);
      }

      setTimeout(async () => {
        const newData = fetchData();
        setData(newData);
        const {getDateRangeForPeriod, getDateRangeDescription} = await import(
          '../core/date-utils'
        );
        const range = getDateRangeForPeriod(period);
        setCurrentRangeDescription(
          getDateRangeDescription(range.start, range.end),
        );
      }, 0);
    },
    [onPeriodChange, fetchData],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      handleRefresh();
    }, 30000);

    return () => clearInterval(interval);
  }, [handleRefresh]);

  return React.createElement(Dashboard, {
    summary: data.summary,
    rangeDescription: currentRangeDescription,
    useRawLabels,
    onRefresh: handleRefresh,
    onPeriodChange: handlePeriodChange,
    currentPeriod: internalCurrentPeriod,
    onExit,
    lastUpdated: data.lastUpdated,
  });
};
