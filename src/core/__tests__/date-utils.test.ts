import {describe, expect, it} from 'bun:test';

import {
  getAdjacentDateRange,
  getDateRangeDescription,
  isValidDateString,
  validateAndResolveDateRange,
} from '../date-utils';

describe('isValidDateString', () => {
  it.each(['2026-08-16', '2024-02-29'])(
    'accepts valid ISO calendar date %s',
    (date) => {
      expect(isValidDateString(date)).toBe(true);
    },
  );

  it.each(['08-16-2026', '2026/08/16', '2026-02-29', '2026-04-31'])(
    'rejects invalid ISO date %s',
    (date) => {
      expect(isValidDateString(date)).toBe(false);
    },
  );
});

describe('getAdjacentDateRange', () => {
  it('moves a daily range by one day', () => {
    expect(getAdjacentDateRange('daily', '2026-08-23', 'previous')).toEqual({
      start: '2026-08-22',
      end: '2026-08-22',
    });
  });

  it('moves a monthly range by one calendar month', () => {
    expect(getAdjacentDateRange('monthly', '2026-08-01', 'next')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });

  it('rejects invalid calendar dates instead of normalizing them', () => {
    expect(() => getAdjacentDateRange('daily', '2026-02-30', 'next')).toThrow(
      'Invalid start date: 2026-02-30. Use YYYY-MM-DD format.',
    );
  });
});

describe('validateAndResolveDateRange', () => {
  it('returns empty bounds when neither bound is supplied', () => {
    expect(validateAndResolveDateRange()).toEqual({
      startDate: '',
      endDate: '',
    });
    expect(
      validateAndResolveDateRange(undefined, undefined, undefined),
    ).toEqual({
      startDate: '',
      endDate: '',
    });
  });

  it('preserves valid lone lower bound', () => {
    expect(validateAndResolveDateRange(undefined, '2026-08-16')).toEqual({
      startDate: '2026-08-16',
      endDate: '',
    });
  });

  it('preserves valid lone upper bound', () => {
    expect(
      validateAndResolveDateRange(undefined, undefined, '2026-08-22'),
    ).toEqual({
      startDate: '',
      endDate: '2026-08-22',
    });
  });

  it('returns valid ordered bounds', () => {
    expect(
      validateAndResolveDateRange(undefined, '2026-08-16', '2026-08-22'),
    ).toEqual({
      startDate: '2026-08-16',
      endDate: '2026-08-22',
    });
  });

  it('accepts equal bounds', () => {
    expect(
      validateAndResolveDateRange(undefined, '2026-08-16', '2026-08-16'),
    ).toEqual({
      startDate: '2026-08-16',
      endDate: '2026-08-16',
    });
  });

  it('rejects reversed bounds', () => {
    expect(() =>
      validateAndResolveDateRange(undefined, '2026-08-22', '2026-08-16'),
    ).toThrow(/on or before/);
  });

  it('rejects invalid lone start date', () => {
    expect(() => validateAndResolveDateRange(undefined, 'not-a-date')).toThrow(
      /Invalid start date/,
    );
    expect(() => validateAndResolveDateRange(undefined, '2026-02-30')).toThrow(
      /Invalid start date/,
    );
  });

  it('rejects invalid lone end date', () => {
    expect(() =>
      validateAndResolveDateRange(undefined, undefined, 'not-a-date'),
    ).toThrow(/Invalid end date/);
    expect(() =>
      validateAndResolveDateRange(undefined, undefined, '2026-02-30'),
    ).toThrow(/Invalid end date/);
  });

  it('rejects explicitly empty bounds', () => {
    expect(() => validateAndResolveDateRange(undefined, '')).toThrow(
      /Invalid start date/,
    );
    expect(() => validateAndResolveDateRange(undefined, undefined, '')).toThrow(
      /Invalid end date/,
    );
    expect(() =>
      validateAndResolveDateRange(undefined, '2026-08-16', ''),
    ).toThrow(/Invalid end date/);
  });

  it('prioritizes valid period over accompanying explicit bounds', () => {
    const result = validateAndResolveDateRange(
      'daily',
      'not-a-date',
      'not-a-date',
    );
    expect(result.startDate).toBeTruthy();
    expect(result.endDate).toBeTruthy();
    expect(result.startDate).toBe(result.endDate);

    const monthlyResult = validateAndResolveDateRange(
      'monthly',
      '2026-08-22',
      '2026-08-16',
    );
    expect(monthlyResult.startDate).toBeTruthy();
    expect(monthlyResult.endDate).toBeTruthy();
  });

  it('rejects invalid period', () => {
    expect(() => validateAndResolveDateRange('hourly')).toThrow(
      /Invalid period/,
    );
  });
});

describe('getDateRangeDescription', () => {
  it('formats lone lower bound', () => {
    expect(getDateRangeDescription('2026-08-16', '')).toBe('from Aug 16, 2026');
  });

  it('formats lone upper bound', () => {
    expect(getDateRangeDescription('', '2026-08-22')).toBe(
      'through Aug 22, 2026',
    );
  });

  it('formats empty bounds', () => {
    expect(getDateRangeDescription('', '')).toBe('all time');
  });

  it('formats single day', () => {
    expect(getDateRangeDescription('2026-08-16', '2026-08-16')).toBe(
      'August 16, 2026',
    );
  });
});
