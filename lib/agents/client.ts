import { createAnthropic } from '@ai-sdk/anthropic';

/**
 * The single import site for the Anthropic provider.
 *
 * `createAnthropic` already falls back to the `ANTHROPIC_BASE_URL` environment
 * variable on its own, so passing it here changes no behaviour — it is spelled
 * out so the override the E2E suite relies on (see `e2e/mock-anthropic.mjs`) is
 * discoverable from app code instead of only from the provider's source.
 *
 * The base URL must include the API version segment: the provider appends
 * `/messages` to it and defaults to `https://api.anthropic.com/v1`.
 */
export const anthropic = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL,
});
