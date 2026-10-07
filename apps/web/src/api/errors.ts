import { CrmError } from "./crm";

export const RATE_LIMIT_MESSAGE = "Too many requests, try again in a minute";

export function errorText(e: unknown, fallback = "Unknown error"): string {
  if (e instanceof CrmError && e.status === 429) return RATE_LIMIT_MESSAGE;
  return e instanceof Error ? e.message : fallback;
}
