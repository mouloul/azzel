import { describe, expect, it } from 'vitest';

import { buildLoginCodeEmailText, sendLoginCodeEmail } from './email';
import { readAdminEmails, readSmtpUrl } from './env';
import {
  CodeExhaustedError,
  DbUnavailableError,
  EmailSendError,
  ForbiddenError,
  InvalidCodeError,
  RateLimitedError,
  toApiError,
  UnauthenticatedError,
} from './errors';
import {
  generateLoginCode,
  isValidEmail,
  normalizeEmail,
  normalizeLoginCode,
  sha256Hex,
} from './service';

describe('normalizeEmail', () => {
  it('trim et minuscules', () => {
    expect(normalizeEmail('  Prenom.NOM@Exemple.DZ ')).toBe('prenom.nom@exemple.dz');
  });

  it('idempotent', () => {
    expect(normalizeEmail(normalizeEmail(' A@B.DZ '))).toBe('a@b.dz');
  });
});

describe('isValidEmail', () => {
  it('accepte une adresse simple', () => {
    expect(isValidEmail('coureur@trail.dz')).toBe(true);
  });

  it('refuse les adresses incomplètes, espacées ou trop longues', () => {
    expect(isValidEmail('coureur@trail')).toBe(false);
    expect(isValidEmail('coureur trail@exemple.dz')).toBe(false);
    expect(isValidEmail('@exemple.dz')).toBe(false);
    expect(isValidEmail('coureur@')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@exemple.dz`)).toBe(false);
  });
});

describe('generateLoginCode', () => {
  it('produit toujours 6 chiffres', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateLoginCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe('sha256Hex', () => {
  it('hache en hexadécimal 64 caractères (vecteur connu)', () => {
    expect(sha256Hex('123456')).toBe(
      '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
    );
    expect(sha256Hex('000000')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('normalizeLoginCode', () => {
  it('extrait les 6 chiffres, collage avec espaces autorisé', () => {
    expect(normalizeLoginCode('123456')).toBe('123456');
    expect(normalizeLoginCode(' 123 456 ')).toBe('123456');
    expect(normalizeLoginCode('123-456')).toBe('123456');
  });

  it('refuse toute saisie qui ne donne pas exactement 6 chiffres', () => {
    expect(normalizeLoginCode('12345')).toBeNull();
    expect(normalizeLoginCode('1234567')).toBeNull();
    expect(normalizeLoginCode('')).toBeNull();
    expect(normalizeLoginCode('abcdef')).toBeNull();
  });
});

describe('buildLoginCodeEmailText', () => {
  it('reprend la formulation française attendue', () => {
    expect(buildLoginCodeEmailText('654321')).toBe(
      'Ton code Azzel : 654321 — valable 10 minutes.',
    );
  });
});

describe('sendLoginCodeEmail', () => {
  describe.skipIf(readSmtpUrl() !== null)('sans SMTP_URL (développement)', () => {
    it('journalise côté serveur sans erreur', async () => {
      await expect(sendLoginCodeEmail('coureur@exemple.dz', '123456')).resolves.toBeUndefined();
    });
  });

  it('SMTP injoignable : EmailSendError', async () => {
    const previous = process.env.SMTP_URL;
    process.env.SMTP_URL = 'smtp://127.0.0.1:1';
    try {
      await expect(sendLoginCodeEmail('coureur@exemple.dz', '123456')).rejects.toBeInstanceOf(
        EmailSendError,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.SMTP_URL;
      } else {
        process.env.SMTP_URL = previous;
      }
    }
  });
});

describe('toApiError', () => {
  it('mappe chaque erreur domaine vers son statut et son enveloppe v1', () => {
    expect(toApiError(new RateLimitedError(42))).toMatchObject({
      status: 429,
      retryAfterSec: 42,
      envelope: {
        version: 1,
        error: { code: 'iam.rate_limited', message: expect.any(String), action: expect.any(String) },
      },
    });
    expect(toApiError(new InvalidCodeError()).status).toBe(400);
    expect(toApiError(new CodeExhaustedError()).status).toBe(400);
    expect(toApiError(new UnauthenticatedError()).status).toBe(401);
    expect(toApiError(new DbUnavailableError()).status).toBe(503);
    expect(toApiError(new EmailSendError()).status).toBe(503);
  });

  it('ForbiddenError : 403 enveloppe iam.forbidden', () => {
    const apiError = toApiError(new ForbiddenError());
    expect(apiError.status).toBe(403);
    expect(apiError.envelope.version).toBe(1);
    expect(apiError.envelope.error.code).toBe('iam.forbidden');
    expect(apiError.envelope.error.message).not.toBe('');
    expect(apiError.envelope.error.action).not.toBe('');
  });

  it('erreur inconnue : 500 avec enveloppe, jamais de message brut', () => {
    const apiError = toApiError(new Error('boom'));
    expect(apiError.status).toBe(500);
    expect(apiError.envelope.error.code).toBe('iam.internal_error');
    expect(apiError.envelope.error.message).not.toContain('boom');
  });
});

describe('readAdminEmails — AZZEL_ADMIN_EMAILS', () => {
  const previous = process.env.AZZEL_ADMIN_EMAILS;

  it('absente ou vide : liste vide', () => {
    delete process.env.AZZEL_ADMIN_EMAILS;
    expect(readAdminEmails()).toEqual([]);
    process.env.AZZEL_ADMIN_EMAILS = '   ';
    expect(readAdminEmails()).toEqual([]);
  });

  it('liste séparée par virgules : trim + minuscules, entrées vides ignorées', () => {
    process.env.AZZEL_ADMIN_EMAILS =
      'Organisateur@Exemple.DZ , autre@test.azzel,,  TROISIEME@test.azzel';
    expect(readAdminEmails()).toEqual([
      'organisateur@exemple.dz',
      'autre@test.azzel',
      'troisieme@test.azzel',
    ]);
  });

  it('un seul email : liste à une entrée', () => {
    process.env.AZZEL_ADMIN_EMAILS = 'solo@test.azzel';
    expect(readAdminEmails()).toEqual(['solo@test.azzel']);
  });

  it('restaure la variable d’environnement', () => {
    if (previous === undefined) {
      delete process.env.AZZEL_ADMIN_EMAILS;
    } else {
      process.env.AZZEL_ADMIN_EMAILS = previous;
    }
    expect(true).toBe(true);
  });
});
