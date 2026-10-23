import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiErreur, creerClientApi } from './api-client';

// Story 6.1 — tests du client HTTP natif : Bearer automatique, enveloppe
// d'erreur ErrorEnvelopeV1 parsée, échec réseau distingué (horsLigne), routes
// code/verify/session/logout/dossier/e-dossard. fetch global stubbé : aucun
// React Native requis ici.

const ENVELOPPE = {
  version: 1,
  error: {
    code: 'iam.rate_limited',
    message: 'Trop de codes demandés pour cette adresse.',
    action: 'Attendez quelques minutes avant de redemander un code.',
  },
};

function reponseJson(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });
}

function fauxFetch(corps: (input: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn(corps);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('creerClientApi — Bearer automatique', () => {
  it('pose Authorization: Bearer dès qu’un token existe', async () => {
    const fetchImpl = fauxFetch(async () => reponseJson(200, { disponible: false }));
    const client = creerClientApi({ baseUrl: 'http://api.test', token: 'jeton-natif', fetchImpl });

    await client.edossard();

    const [input, init] = fetchImpl.mock.calls[0] as [string, RequestInit | undefined];
    expect(input).toBe('http://api.test/api/coureur/e-dossard');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer jeton-natif');
  });

  it('sans token : aucun en-tête d’autorisation', async () => {
    const fetchImpl = fauxFetch(async () => reponseJson(200, { email: 'a@b.c', role: 'coureur', createdAt: '2026-10-01T10:00:00.000Z' }));
    const client = creerClientApi({ baseUrl: 'http://api.test', fetchImpl });

    await client.session();

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>).authorization).toBeUndefined();
  });
});

describe('creerClientApi — erreurs', () => {
  it('échec réseau : ApiErreur horsLigne, statut 0, enveloppe null', async () => {
    const fetchImpl = fauxFetch(async () => {
      throw new TypeError('Network request failed');
    });
    const client = creerClientApi({ baseUrl: 'http://api.test', fetchImpl });

    const erreur = await client.dossier().catch((error: unknown) => error);

    expect(erreur).toBeInstanceOf(ApiErreur);
    const apiErreur = erreur as ApiErreur;
    expect(apiErreur.horsLigne).toBe(true);
    expect(apiErreur.statut).toBe(0);
    expect(apiErreur.enveloppe).toBeNull();
    expect(apiErreur.sessionExpiree).toBe(false);
  });

  it('enveloppe ErrorEnvelopeV1 servie telle quelle (message + action)', async () => {
    const fetchImpl = fauxFetch(async () => reponseJson(429, ENVELOPPE));
    const client = creerClientApi({ baseUrl: 'http://api.test', fetchImpl });

    const erreur = await client.demanderCode('coureur@exemple.dz').catch((error: unknown) => error);

    expect(erreur).toBeInstanceOf(ApiErreur);
    const apiErreur = erreur as ApiErreur;
    expect(apiErreur.statut).toBe(429);
    expect(apiErreur.enveloppe?.error.code).toBe('iam.rate_limited');
    expect(apiErreur.enveloppe?.error.action).toContain('Attendez');
    expect(apiErreur.sessionExpiree).toBe(false);
  });

  it('401 : sessionExpiree vrai (→ écran de reconnexion, cache conservé)', async () => {
    const fetchImpl = fauxFetch(async () =>
      reponseJson(401, {
        version: 1,
        error: { code: 'iam.unauthenticated', message: 'Session expirée.', action: 'Reconnecte-toi.' },
      }),
    );
    const client = creerClientApi({ baseUrl: 'http://api.test', token: 'revoque', fetchImpl });

    const erreur = await client.dossier().catch((error: unknown) => error);

    expect((erreur as ApiErreur).sessionExpiree).toBe(true);
  });

  it('corps non JSON en erreur : enveloppe null, pas de crash', async () => {
    const fetchImpl = fauxFetch(async () => new Response('<html>', { status: 502 }));
    const client = creerClientApi({ baseUrl: 'http://api.test', fetchImpl });

    const erreur = await client.dossier().catch((error: unknown) => error);

    expect((erreur as ApiErreur).statut).toBe(502);
    expect((erreur as ApiErreur).enveloppe).toBeNull();
  });

  it('200 au corps non JSON/null : ApiErreur (contrat rompu), jamais null as T', async () => {
    const fetchImpl = fauxFetch(async () => new Response('<html>', { status: 200 }));
    const client = creerClientApi({ baseUrl: 'http://api.test', fetchImpl });

    const erreur = await client.dossier().catch((error: unknown) => error);

    expect(erreur).toBeInstanceOf(ApiErreur);
    expect((erreur as ApiErreur).statut).toBe(200);
    expect((erreur as ApiErreur).enveloppe).toBeNull();
    expect((erreur as ApiErreur).horsLigne).toBe(false);
  });

  it('délai dépassé : abort → ApiErreur horsLigne (AbortController + setTimeout, pas de chargement infini)', async () => {
    const fetchImpl = fauxFetch(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const client = creerClientApi({ baseUrl: 'http://api.test', fetchImpl, timeoutMs: 20 });

    const erreur = await client.session().catch((error: unknown) => error);

    expect(erreur).toBeInstanceOf(ApiErreur);
    expect((erreur as ApiErreur).horsLigne).toBe(true);
    expect((erreur as ApiErreur).statut).toBe(0);
  });
});

describe('creerClientApi — routes', () => {
  it('demanderCode : POST /api/auth/code avec l’email', async () => {
    const fetchImpl = fauxFetch(async () => reponseJson(200, { ok: true }));
    const client = creerClientApi({ baseUrl: 'http://api.test', fetchImpl });

    await client.demanderCode('Coureur@Exemple.dz');

    const [input, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(input).toBe('http://api.test/api/auth/code');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ email: 'Coureur@Exemple.dz' });
  });

  it('verifierCode : client "native", le token est extrait du corps', async () => {
    const fetchImpl = fauxFetch(async () =>
      reponseJson(200, { ok: true, email: 'coureur@exemple.dz', token: 'jeton-clair' }),
    );
    const client = creerClientApi({ baseUrl: 'http://api.test', fetchImpl });

    const resultat = await client.verifierCode('coureur@exemple.dz', '123456');

    expect(resultat).toEqual({ token: 'jeton-clair', email: 'coureur@exemple.dz' });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'coureur@exemple.dz',
      code: '123456',
      client: 'native',
    });
  });

  it('verifierCode sans token dans la réponse : erreur (contrat rompu)', async () => {
    const fetchImpl = fauxFetch(async () => reponseJson(200, { ok: true, email: 'coureur@exemple.dz' }));
    const client = creerClientApi({ baseUrl: 'http://api.test', fetchImpl });

    const erreur = await client.verifierCode('coureur@exemple.dz', '123456').catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ApiErreur);
  });

  it('deconnexion : POST /api/auth/logout avec Bearer', async () => {
    const fetchImpl = fauxFetch(async () => reponseJson(200, { ok: true }));
    const client = creerClientApi({ baseUrl: 'http://api.test', token: 'jeton', fetchImpl });

    await client.deconnexion();

    const [input, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(input).toBe('http://api.test/api/auth/logout');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer jeton');
  });

  it('dossier : GET /api/coureur/dossier, checklist typée', async () => {
    const checklist = {
      edition: null,
      pieces: [{ id: 'email', libelle: 'Email vérifié', fait: true }],
      recap: null,
    };
    const fetchImpl = fauxFetch(async () => reponseJson(200, checklist));
    const client = creerClientApi({ baseUrl: 'http://api.test', token: 'jeton', fetchImpl });

    const dossier = await client.dossier();

    expect(dossier.pieces[0]?.id).toBe('email');
    const [input] = fetchImpl.mock.calls[0] as [string];
    expect(input).toBe('http://api.test/api/coureur/dossier');
  });

  it('edossard : GET /api/coureur/e-dossard, disponible avec payloadQr', async () => {
    const reponse = {
      disponible: true,
      jeton: 'AbCdEfGhIjKlMnOpQrStUv',
      dossard: 184,
      prenom: 'Yacine',
      nom: 'Amrani',
      epreuveNom: 'La Longue — 35 km',
      editionNom: 'Édition 2027',
      payloadQr: 'azzel-e1:AbCdEfGhIjKlMnOpQrStUv',
    };
    const fetchImpl = fauxFetch(async () => reponseJson(200, reponse));
    const client = creerClientApi({ baseUrl: 'http://api.test', token: 'jeton', fetchImpl });

    const edossard = await client.edossard();

    expect(edossard.disponible).toBe(true);
    if (edossard.disponible) {
      expect(edossard.payloadQr).toBe('azzel-e1:AbCdEfGhIjKlMnOpQrStUv');
      expect(edossard.dossard).toBe(184);
    }
  });
});
