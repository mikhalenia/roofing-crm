/**
 * The one table of user-facing names for pipeline values, shared by the web app (display) and
 * the API (agent prompt and answer safety net). Raw tokens such as expired_unfinaled must
 * never reach a user.
 */

export const PERMIT_STATE_LABELS: Readonly<Record<string, string>> = {
  open: 'Open',
  expired_unfinaled: 'Stalled',
  finaled: 'Completed',
};

export const PERMIT_STATE_HINTS: Readonly<Record<string, string>> = {
  open: 'Permit is still active',
  finaled: 'Permit passed its final inspection',
};

/**
 * An expired permit whose approvals were all completed is not stalled: the work was approved,
 * only the final inspection is missing. The pipeline's stalled filter excludes it too.
 */
const isApprovedExpired = (state: string | null | undefined, approvalsComplete: boolean | null | undefined) =>
  state === 'expired_unfinaled' && approvalsComplete === true;

/** Short name for a permit state: "Open", "Stalled", "Expired (work approved)", "Completed". */
export function permitStateShort(
  state: string | null | undefined,
  approvalsComplete?: boolean | null,
): string | undefined {
  if (isApprovedExpired(state, approvalsComplete)) return 'Expired (work approved)';
  return state ? PERMIT_STATE_LABELS[state] : undefined;
}

/** One-sentence meaning of a permit state. */
export function permitStateMeaning(
  state: string | null | undefined,
  approvalsComplete?: boolean | null,
): string | undefined {
  if (isApprovedExpired(state, approvalsComplete))
    return 'Expired without a final inspection, but all approvals were completed (not counted as stalled)';
  if (state === 'expired_unfinaled') return 'Permit expired without a final inspection or completed approvals';
  return state ? PERMIT_STATE_HINTS[state] : undefined;
}

export const ROOF_BASIS_LABELS: Readonly<Record<string, string>> = {
  final_date: 'final inspection date',
  approval_complete_issue_date: 'approval completed (issue date)',
};

export const CONFIDENCE_LABELS: Readonly<Record<string, string>> = {
  high: 'high confidence',
  medium: 'estimated',
};

export const SIGNAL_LABELS: Readonly<Record<string, string>> = {
  aged_roof: 'Aged roof',
  open_permit: 'Open permit',
  stalled_permit: 'Stalled permit (expired, no approvals)',
};

const q = `["'\`]?`;
const token = (t: string) => new RegExp(`${q}\\b${t}\\b${q}`, 'gi');
const EXPIRED = 'expired without a final inspection';

/**
 * Raw tokens (and the model's jargon for them) with the prose that replaces them, in order.
 * A state phrase before "permit(s)" is moved after the noun so the sentence stays grammatical.
 */
export const RAW_TOKEN_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // "an unfinaled permit" -> "a permit that expired without a final inspection"
  [new RegExp(`\\b(?:an?)\\s+${q}\\b(?:expired_unfinaled|expired,?\\s+unfinaled|unfinaled)\\b${q}\\s+(permits?)\\b`, 'gi'), `a $1 that ${EXPIRED}`],
  [new RegExp(`${q}\\b(?:expired_unfinaled|expired,?\\s+unfinaled|unfinaled)\\b${q}\\s+(permits?)\\b`, 'gi'), `$1 that ${EXPIRED}`],
  [new RegExp(`${q}\\b(?:expired_unfinaled|expired,?\\s+unfinaled|unfinaled)\\b${q}`, 'gi'), EXPIRED],
  [token('approval_complete_issue_date'), ROOF_BASIS_LABELS['approval_complete_issue_date']!],
  [token('final_date'), ROOF_BASIS_LABELS['final_date']!],
  [token('aged_roof'), 'aged roof'],
  [token('open_permit'), 'open permit'],
  [token('stalled_permit'), 'stalled permit'],
  [token('approvalsComplete'), 'approvals completed'],
  [token('isStalled'), 'stalled'],
  [token('finaled'), 'completed'],
];

/** Keeps a capital first letter when the replaced text started a sentence. */
function keepCase(original: string, replacement: string): string {
  const first = original.replace(/^["'`]/, '')[0] ?? '';
  return first && first === first.toUpperCase() && first !== first.toLowerCase()
    ? replacement[0]!.toUpperCase() + replacement.slice(1)
    : replacement;
}

/** Replaces every raw pipeline token in free text (agent prose) with its friendly name. */
export function replaceRawTokens(text: string): string {
  return RAW_TOKEN_REPLACEMENTS.reduce(
    (t, [re, name]) =>
      t.replace(re, (match: string, ...groups: unknown[]) =>
        keepCase(match, name.replace('$1', typeof groups[0] === 'string' ? groups[0] : '')),
      ),
    text,
  );
}
