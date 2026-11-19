import { afterEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

import { nettoyerEvenement, optionsSentry, signalerErreurInattendue } from './observabilite';

afterEach(() => {
  captureException.mockReset();
  vi.restoreAllMocks();
  delete process.env.SENTRY_DSN;
  delete process.env.SENTRY_ENVIRONMENT;
});

describe('optionsSentry', () => {
  it('impose les réglages sans PII ni traces', () => {
    process.env.SENTRY_DSN = 'https://cle@de.sentry.io/1';
    process.env.SENTRY_ENVIRONMENT = 'recette';
    const o = optionsSentry();
    expect(o).toMatchObject({
      dsn: 'https://cle@de.sentry.io/1',
      environment: 'recette',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
    expect(o.beforeSend).toBe(nettoyerEvenement);
  });

  it('rend un DSN absent sans lever', () => {
    expect(optionsSentry().dsn).toBeUndefined();
  });
});

describe('nettoyerEvenement', () => {
  it('retire cookies, corps et en-têtes sensibles, réduit l’utilisateur, masque les valeurs', () => {
    const sortie = nettoyerEvenement({
      type: undefined,
      message: 'échec pour a@b.fr',
      request: {
        url: 'https://x/api?email=a@b.fr&t=1',
        query_string: 'email=a@b.fr',
        cookies: { azzel_session: 's' },
        data: { email: 'a@b.fr' },
        headers: { Cookie: 'azzel_session=s', Authorization: 'Bearer abc', accept: 'json', 'x-forwarded-for': '1.2.3.4', 'set-cookie': 'a=b' },
      },
      user: { id: '42', email: 'a@b.fr', ip_address: '1.2.3.4' },
      extra: { latitude: 36.7, cle: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b.pdf' },
    });
    expect(sortie.request).toEqual({ url: 'https://x/api' });
    expect(sortie.user).toEqual({ id: '42' });
    expect(sortie.message).toBe('échec pour [masqué]');
    expect(sortie.extra).toEqual({ latitude: '[masqué]', cle: '[masqué]' });
  });
});

describe('signalerErreurInattendue', () => {
  it('journalise et capture avec l’étiquette module', () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = new Error('boum');
    signalerErreurInattendue('chrono', e);
    expect(erreur).toHaveBeenCalledWith('[%s] erreur inattendue (500) :', 'chrono', e);
    expect(captureException).toHaveBeenCalledWith(e, { tags: { module: 'chrono' } });
  });
});
