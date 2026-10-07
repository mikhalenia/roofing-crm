import { describe, expect, it } from 'vitest';
import { permitStateMeaning, permitStateShort, replaceRawTokens } from './labels';

describe('replaceRawTokens', () => {
  it('replaces every raw token and the model jargon', () => {
    expect(
      replaceRawTokens(
        "final_date, approval_complete_issue_date, aged_roof, open_permit, stalled_permit, finaled, 'expired_unfinaled'",
      ),
    ).toBe(
      'final inspection date, approval completed (issue date), aged roof, open permit, stalled permit, completed, expired without a final inspection',
    );
    expect(replaceRawTokens('all of which have expired, unfinaled permits')).toBe(
      'all of which have expired without a final inspection permits',
    );
    expect(replaceRawTokens('Unfinaled permit')).toBe('expired without a final inspection permit');
    expect(replaceRawTokens('Open roofs, final inspection')).toBe('Open roofs, final inspection');
  });

  it('is stable across calls (global regexes)', () => {
    expect(replaceRawTokens('aged_roof')).toBe('aged roof');
    expect(replaceRawTokens('aged_roof')).toBe('aged roof');
  });
});

describe('permit state names', () => {
  it('separates stalled permits from expired permits whose approvals were completed', () => {
    expect(permitStateShort('expired_unfinaled', false)).toBe('Stalled');
    expect(permitStateShort('expired_unfinaled', undefined)).toBe('Stalled');
    expect(permitStateShort('expired_unfinaled', true)).toBe('Expired (work approved)');
    expect(permitStateShort('open', true)).toBe('Open');
    expect(permitStateShort('finaled')).toBe('Completed');
    expect(permitStateMeaning('expired_unfinaled', true)).toBe(
      'Expired without a final inspection, but all approvals were completed (not counted as stalled)',
    );
    expect(permitStateMeaning('expired_unfinaled', false)).toBe(
      'Permit expired without a final inspection or completed approvals',
    );
  });
});
