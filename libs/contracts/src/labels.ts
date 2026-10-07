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
  expired_unfinaled: 'Permit expired without a final inspection',
  finaled: 'Permit passed its final inspection',
};

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
  stalled_permit: 'Stalled permit',
};

const q = `["'\`]?`;
const token = (t: string) => new RegExp(`${q}\\b${t}\\b${q}`, 'g');

/** Raw tokens (and the model's jargon for them) with the prose that replaces them, in order. */
export const RAW_TOKEN_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [token('expired_unfinaled'), 'stalled'],
  [/\bexpired,?\s+unfinaled\b|\bunfinaled\b/gi, 'stalled (expired without a final inspection)'],
  [token('approval_complete_issue_date'), ROOF_BASIS_LABELS['approval_complete_issue_date']!],
  [token('final_date'), ROOF_BASIS_LABELS['final_date']!],
  [token('aged_roof'), 'aged roof'],
  [token('open_permit'), 'open permit'],
  [token('stalled_permit'), 'stalled permit'],
  [token('finaled'), 'completed'],
];

/** Replaces every raw pipeline token in free text (agent prose) with its friendly name. */
export function replaceRawTokens(text: string): string {
  return RAW_TOKEN_REPLACEMENTS.reduce((t, [re, name]) => t.replace(re, name), text);
}
