declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AI: Ai;
    PIPELINE_API: string;
    ALLOWED_ORIGIN: string;
  }
}
