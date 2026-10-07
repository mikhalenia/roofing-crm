import type { z } from "zod";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Shared JSON request helper: maps network failures, non-2xx statuses, invalid
 * JSON and schema mismatches to the caller's error type. A null schema means
 * the body is ignored (e.g. 204 responses).
 */
export async function requestJson<T>(opts: {
  url: string;
  init?: RequestInit;
  schema: z.ZodType<T> | null;
  fetcher: Fetcher;
  label: string;
  makeError: (message: string, status: number) => Error;
}): Promise<T> {
  const { url, init, schema, fetcher, label, makeError } = opts;
  let res: Response;
  try {
    res = await fetcher(url, init);
  } catch (e) {
    throw makeError(`${label} unreachable: ${e instanceof Error ? e.message : String(e)}`, 0);
  }
  if (!res.ok) throw makeError(`${label} error ${res.status}`, res.status);
  if (schema === null) return undefined as T;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw makeError(`${label} returned invalid JSON`, res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw makeError(`${label} returned an unexpected response`, res.status);
  return parsed.data;
}
