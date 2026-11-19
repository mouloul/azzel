import * as Sentry from '@sentry/nextjs';

import { optionsSentry } from '@/lib/observabilite';

export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const options = optionsSentry();
  if (!options.dsn) {
    return;
  }
  Sentry.init(options);
}

export const onRequestError = Sentry.captureRequestError;
