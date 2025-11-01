import dayjs from 'dayjs';

export interface DateRange {
  start: string;
  end: string;
}

export type TimePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Get the date range for today
 */
export function getDailyRange(): DateRange {
  const today = dayjs();
  return {
    start: today.format('YYYY-MM-DD'),
    end: today.format('YYYY-MM-DD'),
  };
}

/**
 * Get the date range for the current week (Sunday to Saturday)
 */
export function getWeeklyRange(): DateRange {
  const today = dayjs();
  const startOfWeek = today.startOf('week');
  const endOfWeek = today.endOf('week');

  return {
    start: startOfWeek.format('YYYY-MM-DD'),
    end: endOfWeek.format('YYYY-MM-DD'),
  };
}

/**
 * Get the date range for the current month
 */
export function getMonthlyRange(): DateRange {
  const today = dayjs();
  const startOfMonth = today.startOf('month');
  const endOfMonth = today.endOf('month');

  return {
    start: startOfMonth.format('YYYY-MM-DD'),
    end: endOfMonth.format('YYYY-MM-DD'),
  };
}

/**
 * Get the date range for the current year
 */
export function getYearlyRange(): DateRange {
  const today = dayjs();
  const startOfYear = today.startOf('year');
  const endOfYear = today.endOf('year');

  return {
    start: startOfYear.format('YYYY-MM-DD'),
    end: endOfYear.format('YYYY-MM-DD'),
  };
}

/**
 * Get the date range for a specific time period
 */
export function getDateRangeForPeriod(period: TimePeriod): DateRange {
  switch (period) {
    case 'daily':
      return getDailyRange();
    case 'weekly':
      return getWeeklyRange();
    case 'monthly':
      return getMonthlyRange();
    case 'yearly':
      return getYearlyRange();
  }
}

/**
 * Validate a date string in YYYY-MM-DD format
 */
export function isValidDateString(dateStr: string): boolean {
  return dayjs(dateStr, 'YYYY-MM-DD', true).isValid();
}

/**
 * Get a human-readable description of a date range
 */
export function getDateRangeDescription(
  startDate: string,
  endDate: string,
): string {
  const start = dayjs(startDate);
  const end = dayjs(endDate);

  if (start.isSame(end, 'day')) {
    return start.format('MMMM D, YYYY');
  }

  if (start.isSame(end, 'month')) {
    return `${start.format('MMMM D')} - ${end.format('D, YYYY')}`;
  }

  if (start.isSame(end, 'year')) {
    return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
  }

  return `${start.format('MMM D, YYYY')} - ${end.format('MMM D, YYYY')}`;
}
