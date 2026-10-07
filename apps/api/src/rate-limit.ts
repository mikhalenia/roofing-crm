import type { MiddlewareHandler } from "hono";

const WRITE_LIMIT = 60;

/** Fixed-window limiter: at most 60 write requests per IP per UTC minute, counted in D1. */
export const writeLimit: MiddlewareHandler<{ Bindings: Cloudflare.Env }> = async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "OPTIONS" || c.req.method === "HEAD") {
    return next();
  }
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const minute = new Date().toISOString().slice(0, 16);
  let count = 1;
  try {
    const [, row] = await c.env.DB.batch<{ count: number }>([
      c.env.DB.prepare("DELETE FROM rate_limits WHERE ip = ? AND minute < ?").bind(ip, minute),
      c.env.DB.prepare(
        `INSERT INTO rate_limits (ip, minute, count) VALUES (?, ?, 1)
         ON CONFLICT (ip, minute) DO UPDATE SET count = count + 1
         RETURNING count`,
      ).bind(ip, minute),
    ]);
    count = row?.results[0]?.count ?? 1;
  } catch (err) {
    // Fail open: a limiter outage must not take the API down.
    console.warn("rate limiter unavailable, allowing request:", err instanceof Error ? err.message : err);
  }
  if (count > WRITE_LIMIT) return c.json({ error: "rate limited" }, 429);
  return next();
};
