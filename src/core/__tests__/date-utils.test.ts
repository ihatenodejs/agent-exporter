import {describe, expect, it} from 'bun:test';
import dayjs from 'dayjs';

import {
  getDailyRange,
  getWeeklyRange,
  getMonthlyRange,
  getYearlyRange,
  getDateRangeForPeriod,
  isValidDateString,
  getDateRangeDescription,
  isTimePeriod,
  validateAndResolveDateRange,
} from '../date-utils';

describe('date-utils', () => {
  describe('getDailyRange', () => {
    it('returns today for both start and end', () => {
      const today = dayjs().format('YYYY-MM-DD');
      const range = getDailyRange();

      expect(range.start).toBe(today);
      expect(range.end).toBe(today);
    });
  });

  describe('getWeeklyRange', () => {
    it('returns Sunday to Saturday of current week', () => {
      const range = getWeeklyRange();
      const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD');
      const endOfWeek = dayjs().endOf('week').format('YYYY-MM-DD');

      expect(range.start).toBe(startOfWeek);
      expect(range.end).toBe(endOfWeek);
    });
  });

  describe('getMonthlyRange', () => {
    it('returns first to last day of current month', () => {
      const range = getMonthlyRange();
      const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
      const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');

      expect(range.start).toBe(startOfMonth);
      expect(range.end).toBe(endOfMonth);
    });
  });

  describe('getYearlyRange', () => {
    it('returns Jan 1 to Dec 31 of current year', () => {
      const range = getYearlyRange();
      const startOfYear = dayjs().startOf('year').format('YYYY-MM-DD');
      const endOfYear = dayjs().endOf('year').format('YYYY-MM-DD');

      expect(range.start).toBe(startOfYear);
      expect(range.end).toBe(endOfYear);
    });
  });

  describe('getDateRangeForPeriod', () => {
    it('returns daily range for daily period', () => {
      const range = getDateRangeForPeriod('daily');
      const expected = getDailyRange();

      expect(range).toEqual(expected);
    });

    it('returns weekly range for weekly period', () => {
      const range = getDateRangeForPeriod('weekly');
      const expected = getWeeklyRange();

      expect(range).toEqual(expected);
    });

    it('returns monthly range for monthly period', () => {
      const range = getDateRangeForPeriod('monthly');
      const expected = getMonthlyRange();

      expect(range).toEqual(expected);
    });

    it('returns yearly range for yearly period', () => {
      const range = getDateRangeForPeriod('yearly');
      const expected = getYearlyRange();

      expect(range).toEqual(expected);
    });
  });

  describe('isValidDateString', () => {
    it('returns true for valid YYYY-MM-DD format', () => {
      expect(isValidDateString('2024-01-15')).toBe(true);
      expect(isValidDateString('2023-12-31')).toBe(true);
      expect(isValidDateString('2025-06-01')).toBe(true);
    });

    it('returns false for clearly invalid strings', () => {
      expect(isValidDateString('invalid')).toBe(false);
      expect(isValidDateString('')).toBe(false);
    });
  });

  describe('getDateRangeDescription', () => {
    it('formats same day correctly', () => {
      const description = getDateRangeDescription('2024-03-15', '2024-03-15');

      expect(description).toBe('March 15, 2024');
    });

    it('formats same month correctly', () => {
      const description = getDateRangeDescription('2024-03-10', '2024-03-20');

      expect(description).toBe('March 10 - 20, 2024');
    });

    it('formats same year correctly', () => {
      const description = getDateRangeDescription('2024-03-15', '2024-06-20');

      expect(description).toBe('Mar 15 - Jun 20, 2024');
    });

    it('formats different years correctly', () => {
      const description = getDateRangeDescription('2023-11-15', '2024-02-20');

      expect(description).toBe('Nov 15, 2023 - Feb 20, 2024');
    });
  });

  describe('isTimePeriod', () => {
    it('returns true for valid periods', () => {
      expect(isTimePeriod('daily')).toBe(true);
      expect(isTimePeriod('weekly')).toBe(true);
      expect(isTimePeriod('monthly')).toBe(true);
      expect(isTimePeriod('yearly')).toBe(true);
    });

    it('returns false for invalid periods', () => {
      expect(isTimePeriod('hourly')).toBe(false);
      expect(isTimePeriod('biweekly')).toBe(false);
      expect(isTimePeriod('')).toBe(false);
      expect(isTimePeriod('Daily')).toBe(false);
    });
  });

  describe('validateAndResolveDateRange', () => {
    it('resolves valid period to date range', () => {
      const result = validateAndResolveDateRange('daily');
      const expected = getDailyRange();

      expect(result.startDate).toBe(expected.start);
      expect(result.endDate).toBe(expected.end);
    });

    it('throws for invalid period', () => {
      expect(() => validateAndResolveDateRange('biweekly')).toThrow(
        'Invalid period: biweekly. Must be one of: daily, weekly, monthly, yearly',
      );
    });

    it('returns provided start and end dates when valid', () => {
      const result = validateAndResolveDateRange(
        undefined,
        '2024-01-01',
        '2024-01-31',
      );

      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-01-31');
    });

    it('throws for invalid start date', () => {
      expect(() =>
        validateAndResolveDateRange(undefined, 'invalid', '2024-01-31'),
      ).toThrow('Invalid start date: invalid. Use YYYY-MM-DD format.');
    });

    it('throws for invalid end date', () => {
      expect(() =>
        validateAndResolveDateRange(undefined, '2024-01-01', 'invalid'),
      ).toThrow('Invalid end date: invalid. Use YYYY-MM-DD format.');
    });

    it('returns empty strings when no parameters provided', () => {
      const result = validateAndResolveDateRange();

      expect(result.startDate).toBe('');
      expect(result.endDate).toBe('');
    });

    it('returns empty strings when only start date provided', () => {
      const result = validateAndResolveDateRange(undefined, '2024-01-01');

      expect(result.startDate).toBe('');
      expect(result.endDate).toBe('');
    });

    it('returns empty strings when only end date provided', () => {
      const result = validateAndResolveDateRange(
        undefined,
        undefined,
        '2024-01-31',
      );

      expect(result.startDate).toBe('');
      expect(result.endDate).toBe('');
    });
  });
});
