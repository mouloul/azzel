import { describe, expect, it } from 'vitest';
import type { ChecklistState, ReponseEdossardApi } from '@azzel/shared';

import { ApiErreur, type ClientApi, type SessionApi } from './api-client';
import { chargerDossier, connecter, demarrer, type PortsOrchestration } from './orchestration';
import type { EtatSession } from './auth-store';
import type { EdossardCache } from './offline-cache';

// Story 6.1 (revue) — tests de l'orchestration, ports entièrement injectés :
// (a) hors-ligne + cache dossier → écran cible depuis le cache, (b) 401 →
// session oubliée ET caches conservés → reconnexion, (c) dossier validé →
// e-dossard direct, (d) cache validé sans cache e-dossard → écran dossier,
// plus : changement de compte purge AVANT le fetch, bandeau quand l'e-dossard
// vient du cache après un dossier réseau OK.

const DOSSIER_EN_COURS: ChecklistState = {
  edition: null,
  pieces: [
    { id: 'email', libelle: 'Email vérifié', fait: true },
    { id: 'validation', libelle: 'Dossier validé', fait: false },
  ],
  recap: null,
};

const DOSSIER_VALIDE: ChecklistState = {
  ...DOSSIER_EN_COURS,
  pieces: [
    { id: 'email', libelle: 'Email vérifié', fait: true },
    { id: 'validation', libelle: 'Dossier validé', fait: true },
  ],
};

const EDOSSARD_CACHE: EdossardCache = {
  jeton: 'AbCdEfGhIjKlMnOpQrStUv',
  dossard: 184,
  prenom: 'Yacine',
  nom: 'Amrani',
  epreuveNom: 'La Longue — 35 km',
  editionNom: 'Édition 2027',
  payloadQr: 'azzel-e1:AbCdEfGhIjKlMnOpQrStUv',
};

const REPONSE_EDOSSARD: ReponseEdossardApi = {
  disponible: true,
  ...EDOSSARD_CACHE,
};

const SESSION_OK: SessionApi = {
  email: 'yacine@exemple.dz',
  role: 'coureur',
  createdAt: '2026-10-01T10:00:00.000Z',
};

const HORS_LIGNE = () => Promise.reject(new ApiErreur(0, null, true));
const REFUS_401 = () =>
  Promise.reject(
    new ApiErreur(
      401,
      {
        version: 1,
        error: {
          code: 'iam.unauthenticated',
          message: 'Session expirée.',
          action: 'Reconnecte-toi.',
        },
      },
      false,
    ),
  );

interface MemoirePorts {
  token: string | null;
  etatSession: EtatSession | null;
  cacheDossier: ChecklistState | null;
  cacheEdossard: EdossardCache | null;
  sessionOubliee: boolean;
  cachePurge: boolean;
  traces: string[];
}

function creerPorts(options: {
  client: Partial<ClientApi>;
  tokenInitial?: string | null;
  etatSessionInitial?: EtatSession | null;
  cacheDossierInitial?: ChecklistState | null;
  cacheEdossardInitial?: EdossardCache | null;
}): { ports: PortsOrchestration; memoire: MemoirePorts } {
  const memoire: MemoirePorts = {
    token: options.tokenInitial ?? null,
    etatSession: options.etatSessionInitial ?? null,
    cacheDossier: options.cacheDossierInitial ?? null,
    cacheEdossard: options.cacheEdossardInitial ?? null,
    sessionOubliee: false,
    cachePurge: false,
    traces: [],
  };
  const pasUtilise = () => Promise.reject(new ApiErreur(500, null, false));
  const client = {
    session: HORS_LIGNE,
    dossier: HORS_LIGNE,
    edossard: HORS_LIGNE,
    demanderCode: pasUtilise,
    verifierCode: pasUtilise,
    deconnexion: pasUtilise,
    ...options.client,
  } as ClientApi;
  const ports: PortsOrchestration = {
    creerClient: (token) => {
      expect(typeof token).toBe('string');
      return client;
    },
    lireToken: async () => memoire.token,
    ecrireToken: async (token) => {
      memoire.traces.push('ecrireToken');
      memoire.token = token;
    },
    lireEtatSession: async () => memoire.etatSession,
    ecrireEtatSession: async (etat) => {
      memoire.etatSession = etat;
    },
    oublierSession: async () => {
      memoire.traces.push('oublierSession');
      memoire.sessionOubliee = true;
      memoire.token = null;
      memoire.etatSession = null;
    },
    purgerCache: async () => {
      memoire.traces.push('purgerCache');
      memoire.cachePurge = true;
      memoire.cacheDossier = null;
      memoire.cacheEdossard = null;
    },
    lireCacheDossier: async () =>
      memoire.cacheDossier
        ? { recuLe: '2026-10-23T10:00:00.000Z', donnees: memoire.cacheDossier }
        : null,
    ecrireCacheDossier: async (dossier) => {
      memoire.cacheDossier = dossier;
    },
    lireCacheEdossard: async () =>
      memoire.cacheEdossard
        ? { recuLe: '2026-10-23T10:00:00.000Z', donnees: memoire.cacheEdossard }
        : null,
    ecrireCacheEdossard: async (reponse) => {
      if (reponse.disponible) {
        const { disponible: _disponible, ...etat } = reponse;
        memoire.cacheEdossard = etat;
      }
    },
  };
  // Traçons aussi les fetchs pour l'ordre purge → fetch.
  const traces = memoire.traces;
  const clientTrace: ClientApi = {
    session: (...args) => {
      traces.push('fetch:session');
      return client.session(...args);
    },
    demanderCode: client.demanderCode.bind(client),
    verifierCode: client.verifierCode.bind(client),
    deconnexion: client.deconnexion.bind(client),
    dossier: (...args) => {
      traces.push('fetch:dossier');
      return client.dossier(...args);
    },
    edossard: (...args) => {
      traces.push('fetch:edossard');
      return client.edossard(...args);
    },
  };
  ports.creerClient = () => clientTrace;
  return { ports, memoire };
}

describe('demarrer — hors-ligne (a) : cache dossier servi, bandeau', () => {
  it('dossier en cours en cache → écran dossier depuis le cache', async () => {
    const { ports, memoire } = creerPorts({
      client: { session: HORS_LIGNE },
      tokenInitial: 'jeton-natif',
      cacheDossierInitial: DOSSIER_EN_COURS,
    });

    const maj = await demarrer(ports);

    expect(maj.ecran).toBe('dossier');
    expect(maj.depuisCache).toBe(true);
    expect(maj.dossier).toEqual(DOSSIER_EN_COURS);
    expect(maj.token).toBe('jeton-natif');
    expect(memoire.sessionOubliee).toBe(false);
  });

  it('dossier validé en cache AVEC cache e-dossard → écran e-dossard depuis le cache', async () => {
    const { ports } = creerPorts({
      client: { session: HORS_LIGNE },
      tokenInitial: 'jeton-natif',
      cacheDossierInitial: DOSSIER_VALIDE,
      cacheEdossardInitial: EDOSSARD_CACHE,
    });

    const maj = await demarrer(ports);

    expect(maj.ecran).toBe('edossard');
    expect(maj.edossard?.payloadQr).toBe('azzel-e1:AbCdEfGhIjKlMnOpQrStUv');
    expect(maj.depuisCache).toBe(true);
  });

  it('aucun cache → écran première connexion requise', async () => {
    const { ports } = creerPorts({ client: { session: HORS_LIGNE }, tokenInitial: 'jeton' });

    const maj = await demarrer(ports);

    expect(maj.ecran).toBe('hors-ligne');
  });
});

describe('(d) dossier validé en cache SANS cache e-dossard → checklist, pas un e-dossard vide', () => {
  it('demarrer hors-ligne : écran dossier (checklist lisible)', async () => {
    const { ports } = creerPorts({
      client: { session: HORS_LIGNE },
      tokenInitial: 'jeton-natif',
      cacheDossierInitial: DOSSIER_VALIDE,
    });

    const maj = await demarrer(ports);

    expect(maj.ecran).toBe('dossier');
    expect(maj.depuisCache).toBe(true);
    expect(maj.edossard).toBeNull();
  });

  it('chargerDossier réseau coupé (dossier injoignable) : même repli', async () => {
    const { ports } = creerPorts({
      client: { dossier: HORS_LIGNE },
      cacheDossierInitial: DOSSIER_VALIDE,
    });

    const maj = await chargerDossier(ports, 'jeton-natif');

    expect(maj.ecran).toBe('dossier');
    expect(maj.depuisCache).toBe(true);
  });
});

describe('(b) 401 → session oubliée, caches CONSERVÉS, reconnexion', () => {
  it('au démarrage (session révoquée AD-5)', async () => {
    const { ports, memoire } = creerPorts({
      client: { session: REFUS_401 },
      tokenInitial: 'jeton-revoque',
      cacheDossierInitial: DOSSIER_VALIDE,
      cacheEdossardInitial: EDOSSARD_CACHE,
    });

    const maj = await demarrer(ports);

    expect(maj.ecran).toBe('connexion');
    expect(maj.sessionExpiree).toBe(true);
    expect(maj.token).toBeNull();
    expect(memoire.sessionOubliee).toBe(true);
    expect(memoire.token).toBeNull();
    // Jamais d'effacement silencieux du cache.
    expect(memoire.cacheDossier).toEqual(DOSSIER_VALIDE);
    expect(memoire.cacheEdossard).toEqual(EDOSSARD_CACHE);
    expect(memoire.cachePurge).toBe(false);
  });

  it('au chargement du dossier (Bearer révoqué entre-temps)', async () => {
    const { ports, memoire } = creerPorts({
      client: { session: async () => SESSION_OK, dossier: REFUS_401 },
      cacheDossierInitial: DOSSIER_EN_COURS,
    });

    const maj = await chargerDossier(ports, 'jeton-revoque');

    expect(maj.ecran).toBe('connexion');
    expect(memoire.sessionOubliee).toBe(true);
    expect(memoire.cacheDossier).toEqual(DOSSIER_EN_COURS);
    expect(memoire.cachePurge).toBe(false);
  });
});

describe('(c) dossier validé → e-dossard direct (étapes court-circuitées)', () => {
  it('dossier réseau OK + e-dossard disponible → écran e-dossard, caches écrits', async () => {
    const { ports, memoire } = creerPorts({
      client: {
        session: async () => SESSION_OK,
        dossier: async () => DOSSIER_VALIDE,
        edossard: async () => REPONSE_EDOSSARD,
      },
    });

    const maj = await chargerDossier(ports, 'jeton-natif');

    expect(maj.ecran).toBe('edossard');
    expect(maj.depuisCache).toBe(false);
    expect(maj.edossard?.payloadQr).toBe('azzel-e1:AbCdEfGhIjKlMnOpQrStUv');
    expect(memoire.cacheDossier).toEqual(DOSSIER_VALIDE);
    expect(memoire.cacheEdossard).toEqual(EDOSSARD_CACHE);
  });

  it('dossier en cours → écran checklist, aucun e-dossard', async () => {
    const { ports } = creerPorts({
      client: { dossier: async () => DOSSIER_EN_COURS, edossard: async () => ({ disponible: false }) },
    });

    const maj = await chargerDossier(ports, 'jeton-natif');

    expect(maj.ecran).toBe('dossier');
    expect(maj.edossard).toBeNull();
  });
});

describe('e-dossard servi du cache après un dossier réseau OK → bandeau', () => {
  it('dossier frais + e-dossard injoignable + cache QR → e-dossard avec depuisCache vrai', async () => {
    const { ports } = creerPorts({
      client: {
        dossier: async () => DOSSIER_VALIDE,
        edossard: HORS_LIGNE,
      },
      cacheEdossardInitial: EDOSSARD_CACHE,
    });

    const maj = await chargerDossier(ports, 'jeton-natif');

    expect(maj.ecran).toBe('edossard');
    expect(maj.depuisCache).toBe(true);
    expect(maj.dossier).toEqual(DOSSIER_VALIDE);
  });

  it('dossier frais + e-dossard injoignable SANS cache → checklist fraîche, pas de bandeau', async () => {
    const { ports } = creerPorts({
      client: { dossier: async () => DOSSIER_VALIDE, edossard: HORS_LIGNE },
    });

    const maj = await chargerDossier(ports, 'jeton-natif');

    expect(maj.ecran).toBe('dossier');
    expect(maj.depuisCache).toBe(false);
  });
});

describe('connecter — changement de compte : purge des caches AVANT le fetch', () => {
  it('email différent du précédent → purgerCache avant fetch:dossier, caches vidés', async () => {
    const { ports, memoire } = creerPorts({
      client: {
        session: async () => SESSION_OK,
        dossier: async () => DOSSIER_EN_COURS,
      },
      etatSessionInitial: { email: 'autre@exemple.dz', role: 'coureur' },
      cacheDossierInitial: DOSSIER_VALIDE,
      cacheEdossardInitial: EDOSSARD_CACHE,
    });

    const maj = await connecter(ports, 'jeton-b', 'yacine@exemple.dz');

    expect(memoire.cachePurge).toBe(true);
    // La purge précède le premier fetch : plus de risque de servir
    // l'identité d'A à B hors-ligne.
    expect(memoire.traces.indexOf('purgerCache')).toBeLessThan(
      memoire.traces.indexOf('fetch:dossier'),
    );
    expect(memoire.cacheDossier).toEqual(DOSSIER_EN_COURS); // réécrit pour B
    expect(maj.ecran).toBe('dossier');
    expect(maj.token).toBe('jeton-b');
  });

  it('même email (reconnexion) → aucune purge', async () => {
    const { ports, memoire } = creerPorts({
      client: { session: async () => SESSION_OK, dossier: async () => DOSSIER_VALIDE, edossard: async () => REPONSE_EDOSSARD },
      etatSessionInitial: { email: 'yacine@exemple.dz', role: 'coureur' },
      cacheDossierInitial: DOSSIER_VALIDE,
    });

    await connecter(ports, 'jeton-nouveau', 'yacine@exemple.dz');

    expect(memoire.cachePurge).toBe(false);
    expect(memoire.cacheDossier).toEqual(DOSSIER_VALIDE);
  });
});
