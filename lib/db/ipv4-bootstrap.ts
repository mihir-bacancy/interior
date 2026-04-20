/**
 * Force IPv4 for outbound HTTP on Node.
 *
 * Neon's HTTP SQL endpoint returns AAAA records that this machine's network
 * can't reach, causing intermittent ETIMEDOUT / EHOSTUNREACH failures. Pinning
 * undici to IPv4 fixes it. Safe no-op on Vercel serverless (which doesn't have
 * this issue, but the agent still works there).
 *
 * Must be imported before `@neondatabase/serverless` — re-exported from
 * `lib/db/index.ts` which imports this first.
 */

// Only set up on Node runtime; Edge runtime doesn't have undici
if (typeof process !== "undefined" && process.versions?.node) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Agent, setGlobalDispatcher } = require("undici") as typeof import("undici");
    setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
  } catch {
    // undici not available (e.g. bundled client) — skip
  }
}

export {};
