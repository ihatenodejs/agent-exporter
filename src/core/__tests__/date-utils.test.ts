import {describe, expect, it} from 'bun:test';

import {isValidDateString} from '../date-utils';

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
