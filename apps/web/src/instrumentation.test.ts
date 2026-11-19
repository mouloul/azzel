import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ init, captureRequestError: vi.fn() }));

import { register } from './instrumentation';

const ENV = ['NEXT_RUNTIME', 'SENTRY_DSN'] as const;
const sauvegarde: Record<string, string | undefined> = {};

beforeEach(() => {
  init.mockReset();
  for (const nom of ENV) {
    sauvegarde[nom] = process.env[nom];
    delete process.env[nom];
  }
});

afterEach(() => {
  for (const nom of ENV) {
    if (sauvegarde[nom] === undefined) delete process.env[nom];
    else process.env[nom] = sauvegarde[nom];
  }
});

describe('register', () => {
  it('n’initialise pas Sentry sans SENTRY_DSN', () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    register();
    expect(init).not.toHaveBeenCalled();
  });

  it('n’initialise pas Sentry hors runtime nodejs', () => {
    process.env.NEXT_RUNTIME = 'edge';
    process.env.SENTRY_DSN = 'https://cle@de.sentry.io/1';
    register();
    expect(init).not.toHaveBeenCalled();
  });

  it('initialise Sentry avec les réglages imposés', () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    process.env.SENTRY_DSN = 'https://cle@de.sentry.io/1';
    register();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0]?.[0]).toMatchObject({
      dsn: 'https://cle@de.sentry.io/1',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: expect.any(Function),
    });
  });
});
