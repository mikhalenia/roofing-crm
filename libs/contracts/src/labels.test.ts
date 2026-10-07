import { describe, expect, it } from 'vitest';
import { replaceRawTokens } from './labels';

describe('replaceRawTokens', () => {
  it('replaces every raw token and the model jargon', () => {
    expect(
      replaceRawTokens(
        "final_date, approval_complete_issue_date, aged_roof, open_permit, stalled_permit, finaled, 'expired_unfinaled'",
      ),
    ).toBe(
      'final inspection date, approval completed (issue date), aged roof, open permit, stalled permit, completed, stalled',
    );
    expect(replaceRawTokens('all of which have expired, unfinaled permits')).toBe(
      'all of which have stalled (expired without a final inspection) permits',
    );
    expect(replaceRawTokens('Unfinaled permit')).toBe('stalled (expired without a final inspection) permit');
    expect(replaceRawTokens('Open roofs, final inspection')).toBe('Open roofs, final inspection');
  });

  it('is stable across calls (global regexes)', () => {
    expect(replaceRawTokens('aged_roof')).toBe('aged roof');
    expect(replaceRawTokens('aged_roof')).toBe('aged roof');
  });
});
