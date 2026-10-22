import type { Sql } from 'postgres';
import { describe, expect, it, vi } from 'vitest';

import {
  CODE_REQUEST_IP_WINDOW_MS,
  MAX_CODE_REQUESTS_PER_IP,
} from './constants';
import { buildLoginCodeEmailText, sendLoginCodeEmail } from './email';
import { readAdminEmails, readSmtpUrl } from './env';
import {
  AppRoleMisconfiguredError,
  CodeExhaustedError,
  DbUnavailableError,
  EmailInvalidError,
  EmailSendError,
  ForbiddenError,
  InvalidCodeError,
  InvalidCredentialsError,
  InvitationExpiredError,
  InvitationInvalidError,
  PasswordInvalidError,
  RateLimitedError,
  toApiError,
  UnauthenticatedError,
  VolunteerCodeLoginRefusedError,
} from './errors';
import {
  activerVolontaire,
  connecterVolontaire,
  generateLoginCode,
  hashClientIp,
  isValidEmail,
  normalizeEmail,
  normalizeLoginCode,
  requestLoginCode,
  sha256Hex,
  verifyLoginCode,
} from './service';
import { createAppRoleGuard, createIamStore, type IamStore } from './store';

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

  it('sans SMTP_URL en production : EmailSendError (délègue au transport, pas de repli console)', async () => {
    vi.stubEnv('SMTP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      await expect(sendLoginCodeEmail('coureur@exemple.dz', '123456')).rejects.toBeInstanceOf(
        EmailSendError,
      );
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      vi.unstubAllEnvs();
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

// --- Correctifs sécurité stories 1.2 / 1.9 -----------------------------------

function createFakeStore(overrides: Partial<IamStore> = {}): IamStore {
  return {
    getDefaultOrganisationId: async () => '00000000-0000-0000-0000-000000000001',
    recordCodeRequestIp: async () => {},
    insertLoginCode: async () => {},
    verifyCodeAndStartSession: async () => ({ ok: false, reason: 'code_invalid' }),
    findAccountRoleByEmail: async () => null,
    consumeInvitationAndStartSession: async () => ({ ok: false, reason: 'invalid' }),
    verifyPasswordAndStartSession: async () => ({ ok: false, reason: 'invalid_credentials' }),
    findSessionByTokenHash: async () => null,
    revokeSessionByTokenHash: async () => {},
    ...overrides,
  };
}

describe('quota par IP de la demande de code', () => {
  it('hashClientIp : empreinte stable, jamais l’IP en clair, sensible au sel', () => {
    vi.stubEnv('AZZEL_IP_HASH_SALT', 'sel-a');
    const premier = hashClientIp('203.0.113.7');
    expect(premier).toMatch(/^[0-9a-f]{64}$/);
    expect(premier).toBe(hashClientIp('203.0.113.7'));
    expect(premier).not.toContain('203.0.113.7');
    expect(hashClientIp('203.0.113.8')).not.toBe(premier);
    vi.stubEnv('AZZEL_IP_HASH_SALT', 'sel-b');
    expect(hashClientIp('203.0.113.7')).not.toBe(premier);
    vi.unstubAllEnvs();
  });

  it('IP fournie : le quota est consommé AVANT toute écriture liée à l’email', async () => {
    const ordre: string[] = [];
    const store = createFakeStore({
      recordCodeRequestIp: async () => {
        ordre.push('ip');
      },
      insertLoginCode: async () => {
        ordre.push('code');
      },
    });
    await requestLoginCode(
      'coureur@exemple.dz',
      { store, sendCode: async () => {} },
      { clientIp: '203.0.113.7' },
    );
    expect(ordre).toEqual(['ip', 'code']);
  });

  it('quota IP atteint : RateLimitedError, aucun code créé ni envoyé', async () => {
    const insertLoginCode = vi.fn(async () => {});
    const sendCode = vi.fn(async () => {});
    const store = createFakeStore({
      recordCodeRequestIp: async () => {
        throw new RateLimitedError(900);
      },
      insertLoginCode,
    });
    await expect(
      requestLoginCode('coureur@exemple.dz', { store, sendCode }, { clientIp: '203.0.113.7' }),
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(insertLoginCode).not.toHaveBeenCalled();
    expect(sendCode).not.toHaveBeenCalled();
  });

  it('IP absente ou vide : pas d’appel au quota, le flux reste nominal', async () => {
    const recordCodeRequestIp = vi.fn(async () => {});
    const store = createFakeStore({ recordCodeRequestIp });
    await requestLoginCode('coureur@exemple.dz', { store, sendCode: async () => {} });
    await requestLoginCode(
      'coureur@exemple.dz',
      { store, sendCode: async () => {} },
      { clientIp: '   ' },
    );
    expect(recordCodeRequestIp).not.toHaveBeenCalled();
  });

  it('email invalide : refusé avant même le quota IP', async () => {
    const recordCodeRequestIp = vi.fn(async () => {});
    const store = createFakeStore({ recordCodeRequestIp });
    await expect(
      requestLoginCode('pas-un-email', { store, sendCode: async () => {} }, { clientIp: '1.2.3.4' }),
    ).rejects.toBeInstanceOf(EmailInvalidError);
    expect(recordCodeRequestIp).not.toHaveBeenCalled();
  });

  it('seuil par IP bas et explicite, fenêtre d’une heure', () => {
    expect(MAX_CODE_REQUESTS_PER_IP).toBeLessThanOrEqual(50);
    expect(MAX_CODE_REQUESTS_PER_IP).toBeGreaterThan(0);
    expect(CODE_REQUEST_IP_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});

// --- Story 3.1 — parcours volontaire (unitaire, store factice) ------------------

describe('connexion par code refusée pour les volontaires (story 3.1)', () => {
  it('email volontaire existant : refus AVANT toute création de code, aucun envoi', async () => {
    const insertLoginCode = vi.fn(async () => {});
    const sendCode = vi.fn(async () => {});
    const store = createFakeStore({
      findAccountRoleByEmail: async () => 'volontaire',
      insertLoginCode,
    });
    await expect(
      requestLoginCode('volontaire@exemple.dz', { store, sendCode }),
    ).rejects.toBeInstanceOf(VolunteerCodeLoginRefusedError);
    expect(insertLoginCode).not.toHaveBeenCalled();
    expect(sendCode).not.toHaveBeenCalled();
  });

  it('email sans compte ou compte coureur : le flux de code continue', async () => {
    for (const role of [null, 'coureur', 'organisateur'] as const) {
      const insertLoginCode = vi.fn(async () => {});
      const store = createFakeStore({
        findAccountRoleByEmail: async () => role,
        insertLoginCode,
      });
      await requestLoginCode('coureur@exemple.dz', { store, sendCode: async () => {} });
      expect(insertLoginCode).toHaveBeenCalled();
    }
  });

  it('vérification d’un code dont le compte est volontaire : refus orienté', async () => {
    const store = createFakeStore({
      verifyCodeAndStartSession: async () => ({ ok: false as const, reason: 'volontaire' as const }),
    });
    await expect(verifyLoginCode('v@exemple.dz', '123456', { store })).rejects.toBeInstanceOf(
      VolunteerCodeLoginRefusedError,
    );
  });

  it('enveloppes : refus code volontaire 400, identifiants 400, invitation 400/410, mot de passe 400', () => {
    expect(toApiError(new VolunteerCodeLoginRefusedError())).toMatchObject({
      status: 400,
      envelope: { error: { code: 'iam.volontaire_code_refused' } },
    });
    expect(toApiError(new InvalidCredentialsError())).toMatchObject({
      status: 400,
      envelope: { error: { code: 'iam.invalid_credentials' } },
    });
    expect(toApiError(new InvitationInvalidError())).toMatchObject({
      status: 400,
      envelope: { error: { code: 'iam.invitation_invalid' } },
    });
    expect(toApiError(new InvitationExpiredError())).toMatchObject({
      status: 410,
      envelope: { error: { code: 'iam.invitation_expired' } },
    });
    expect(toApiError(new PasswordInvalidError())).toMatchObject({
      status: 400,
      envelope: { error: { code: 'iam.password_invalid' } },
    });
  });

  it('activerVolontaire : jeton trop court et mot de passe hors bornes refusés avant la base', async () => {
    const store = createFakeStore();
    await expect(activerVolontaire('court', 'motdepasse-2026', { store })).rejects.toBeInstanceOf(
      InvitationInvalidError,
    );
    await expect(activerVolontaire('j'.repeat(64), 'court', { store })).rejects.toBeInstanceOf(
      PasswordInvalidError,
    );
  });

  it('activerVolontaire : consommation réussie → token + email ; expirée → InvitationExpiredError', async () => {
    const storeOk = createFakeStore({
      consumeInvitationAndStartSession: async () => ({
        ok: true as const,
        accountId: 'a1',
        organisationId: 'o1',
        email: 'v@exemple.dz',
        role: 'volontaire' as const,
      }),
    });
    const resultat = await activerVolontaire('j'.repeat(64), 'motdepasse-2026', { store: storeOk });
    expect(resultat.email).toBe('v@exemple.dz');
    expect(resultat.token.length).toBeGreaterThanOrEqual(32);

    const storeExpired = createFakeStore({
      consumeInvitationAndStartSession: async () => ({ ok: false as const, reason: 'expired' as const }),
    });
    await expect(
      activerVolontaire('j'.repeat(64), 'motdepasse-2026', { store: storeExpired }),
    ).rejects.toBeInstanceOf(InvitationExpiredError);
  });

  it('connecterVolontaire : échec générique InvalidCredentialsError, jamais d’énumération', async () => {
    const store = createFakeStore({
      verifyPasswordAndStartSession: async () => ({ ok: false as const, reason: 'invalid_credentials' as const }),
    });
    await expect(connecterVolontaire('v@exemple.dz', 'mauvais', { store })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    await expect(connecterVolontaire('pas-un-email', 'motdepasse-2026', { store })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    const storeOk = createFakeStore({
      verifyPasswordAndStartSession: async () => ({
        ok: true as const,
        accountId: 'a1',
        organisationId: 'o1',
        email: 'v@exemple.dz',
        role: 'volontaire' as const,
      }),
    });
    await expect(
      connecterVolontaire('V@Exemple.DZ ', 'motdepasse-2026', { store: storeOk }),
    ).resolves.toMatchObject({ email: 'v@exemple.dz' });
  });

  it('connecterVolontaire : mot de passe hors bornes refusé AVANT scrypt et avant tout appel base', async () => {
    const verifyPasswordAndStartSession = vi.fn();
    const recordCodeRequestIp = vi.fn();
    const store = createFakeStore({ verifyPasswordAndStartSession, recordCodeRequestIp });
    await expect(
      connecterVolontaire('v@exemple.dz', 'x'.repeat(129), { store }, { clientIp: '203.0.113.7' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(verifyPasswordAndStartSession).not.toHaveBeenCalled();
    expect(recordCodeRequestIp).not.toHaveBeenCalled();
  });

  it('connecterVolontaire : quota par IP consommé AVANT la vérification (force brute bornée)', async () => {
    const ordre: string[] = [];
    const store = createFakeStore({
      recordCodeRequestIp: async () => {
        ordre.push('ip');
      },
      verifyPasswordAndStartSession: async () => {
        ordre.push('verif');
        return { ok: false as const, reason: 'invalid_credentials' as const };
      },
    });
    await expect(
      connecterVolontaire('v@exemple.dz', 'motdepasse-2026', { store }, { clientIp: '203.0.113.7' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(ordre).toEqual(['ip', 'verif']);
  });

  it('connecterVolontaire : seuil IP atteint → RateLimitedError (429), la base n’est pas interrogée', async () => {
    const verifyPasswordAndStartSession = vi.fn();
    const store = createFakeStore({
      recordCodeRequestIp: async () => {
        throw new RateLimitedError(900);
      },
      verifyPasswordAndStartSession,
    });
    await expect(
      connecterVolontaire('v@exemple.dz', 'motdepasse-2026', { store }, { clientIp: '203.0.113.7' }),
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(verifyPasswordAndStartSession).not.toHaveBeenCalled();
    expect(toApiError(new RateLimitedError(900)).status).toBe(429);
  });
});

describe('createAppRoleGuard — rôle applicatif (story 1.9)', () => {
  function fakeSql(currentUser: string): Sql {
    const calls = { count: 0 };
    const sql = (async () => {
      calls.count += 1;
      return [{ current_user: currentUser }];
    }) as unknown as Sql & { calls: typeof calls };
    sql.calls = calls;
    return sql;
  }

  it('rôle applicatif : passe sans bruit, une seule interrogation de la base', async () => {
    const sql = fakeSql('azzel_app') as Sql & { calls: { count: number } };
    const guard = createAppRoleGuard(sql, { production: true });
    await expect(guard()).resolves.toBeUndefined();
    await expect(guard()).resolves.toBeUndefined();
    expect(sql.calls.count).toBe(1);
  });

  it('production + mauvais rôle : refuse de servir (erreur, pas un avertissement)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const guard = createAppRoleGuard(fakeSql('azzel'), { production: true });
      await expect(guard()).rejects.toBeInstanceOf(AppRoleMisconfiguredError);
      // Le refus est définitif : chaque accès suivant échoue aussi.
      await expect(guard()).rejects.toBeInstanceOf(AppRoleMisconfiguredError);
      expect(error).toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  it('développement + mauvais rôle : avertissement, le service continue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const guard = createAppRoleGuard(fakeSql('azzel'), { production: false });
      await expect(guard()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('base injoignable : verdict non mémorisé, nouvelle tentative au prochain accès', async () => {
    let appels = 0;
    const sql = (async () => {
      appels += 1;
      if (appels === 1) {
        throw new Error('ECONNREFUSED');
      }
      return [{ current_user: 'azzel_app' }];
    }) as unknown as Sql;
    const guard = createAppRoleGuard(sql, { production: true });
    await expect(guard()).rejects.toThrow('ECONNREFUSED');
    await expect(guard()).resolves.toBeUndefined();
    expect(appels).toBe(2);
  });

  it('garde câblée au store : en production, aucune requête n’est exécutée', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let requetes = 0;
      const sql = (async () => {
        requetes += 1;
        return [{ current_user: 'azzel' }];
      }) as unknown as Sql;
      const store = createIamStore(sql, {
        ensureAppRole: createAppRoleGuard(sql, { production: true }),
      });
      await expect(store.getDefaultOrganisationId()).rejects.toBeInstanceOf(
        AppRoleMisconfiguredError,
      );
      // Seul le SELECT current_user de la garde a été émis.
      expect(requetes).toBe(1);
    } finally {
      error.mockRestore();
    }
  });

  it('AppRoleMisconfiguredError : 503 enveloppe iam.db_misconfigured, sans détail interne', () => {
    const apiError = toApiError(new AppRoleMisconfiguredError('azzel'));
    expect(apiError.status).toBe(503);
    expect(apiError.envelope.error.code).toBe('iam.db_misconfigured');
    expect(apiError.envelope.error.message).not.toContain('azzel_app');
  });
});
