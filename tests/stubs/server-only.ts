// Stub for the "server-only" package so it can be imported under Vitest's
// Node test environment (the real package throws when imported outside the
// Next.js server bundler). No-op is correct here since we exercise the real
// server logic directly in a Node process.
export {};
