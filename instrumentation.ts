import type { InstrumentationOnRequestError } from 'next/dist/server/instrumentation/types';
import { log } from '@/lib/logging/logger';

// ponytail: Sentry/other error tracker plugs in here; one call site
export const onRequestError: InstrumentationOnRequestError = (
  error,
  request,
  context
) => {
  const { message, stack } =
    error instanceof Error
      ? error
      : { message: String(error), stack: undefined };

  log.error('request.error', {
    message,
    stack,
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routeType: context.routeType,
  });
};
