import {describe, expect, it} from 'bun:test';

import {getAdjacentDateRange, isValidDateString} from '../date-utils';

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
});
