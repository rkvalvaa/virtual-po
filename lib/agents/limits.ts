/** Deployment-wide limits; enforced in PostgreSQL before any model invocation. */
export const AGENT_LIMITS = {
  userRunsPerHour: 60,
  orgRunsPerHour: 300,
  orgConcurrentRuns: 3,
  bodyBytes: 128 * 1024,
  messageCount: 100,
  inputBytes: 160 * 1024,
  outputTokensPerStep: 4096,
  steps: 5,
} as const;
