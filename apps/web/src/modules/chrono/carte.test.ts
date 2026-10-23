import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TracePublique } from '@azzel/shared';

import type { ContenusStore, EpreuveParcoursRecord } from '@/modules/contenus/store';
import type { ChronoStore } from './store';
import type { TrackingStore } from '@/modules/tracking/store';

import {
  estEstompeeServeur,
  extrairePointsGpx,
  getPositionsPubliques,
  getTracesPubliques,
  resetCarteCachesForTests,
  TOLERANCE_HORLOGE_MS,
} from './carte';

// Story 7.3 — tests unitaires du service carte : parsing GPX défensif (pures,
// sans réseau) + orchestration des traces avec stores/fetch INJECTÉS (cache
// 1 h par URL, échec isolé par épreuve) + estompée calculée serveur. Les
// preuves base (DISTINCT ON, RLS, anonymat des colonnes) vivent dans
// carte.integration.test.ts.

const GPX_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Azzel">
  <trk><name>La Longue</name><trkseg>
    <trkpt lat="36.5512" lon="4.3601"><ele>210</ele></trkpt>
    <trkpt lat="36.5602" lon="4.3711"></trkpt>
    <trkpt lat="36.9999" lon="4.3800"/>
  </trkseg></trk>
</gpx>`;

function reponseGpx(corps: string, status = 200): Response {
  return new Response(corps, { status });
}

describe('extrairePointsGpx — parsing défensif (pure)', () => {
  it('extrait les trkpt dans l’ordre du document, attributs lat/lon quel que soit l’ordre', () => {
    const gpx = `<gpx><trkseg>
      <trkpt lat="1.5" lon="2.5"/>
      <trkpt lon="6.25" lat="-3.75"/>
    </trkseg></gpx>`;
    expect(extrairePointsGpx(gpx)).toEqual([
      { lat: 1.5, lon: 2.5 },
      { lat: -3.75, lon: 6.25 },
    ]);
  });

  it('GPX fixture : points avec enfants (ele), points auto-fermés, tous extraits', () => {
    const points = extrairePointsGpx(GPX_FIXTURE);
    expect(points).toEqual([
      { lat: 36.5512, lon: 4.3601 },
      { lat: 36.5602, lon: 4.3711 },
      { lat: 36.9999, lon: 4.38 },
    ]);
  });

  it('points invalides ignorés UN À UN : hors bornes GPS, attributs absents', () => {
    const gpx = `<gpx><trkseg>
      <trkpt lat="91" lon="4.3"/>
      <trkpt lat="36.5" lon="200"/>
      <trkpt lat="36.5"/>
      <trkpt lon="4.3"/>
      <trkpt lat="36.55" lon="4.36"/>
    </trkseg></gpx>`;
    expect(extrairePointsGpx(gpx)).toEqual([{ lat: 36.55, lon: 4.36 }]);
  });

  it('revue 7.3 — quotes SIMPLES et espaces autour du « = » : GPX légal (`lat = \'36.5\'`)', () => {
    const gpx = `<gpx><trkseg>
      <trkpt lat = '36.5512' lon='4.3601'/>
      <trkpt lat="36.5602" lon = "4.3711"/>
    </trkseg></gpx>`;
    expect(extrairePointsGpx(gpx)).toEqual([
      { lat: 36.5512, lon: 4.3601 },
      { lat: 36.5602, lon: 4.3711 },
    ]);
  });

  it('GPX sans trkpt (ou vide) : [] — jamais d’erreur', () => {
    expect(extrairePointsGpx('<gpx><trk><name>Vide</name></trk></gpx>')).toEqual([]);
    expect(extrairePointsGpx('')).toEqual([]);
  });
});

function chronoStoreAvec(orgId: string | null) {
  return {
    organisationParDefautId: async () => orgId,
    editionCouranteId: async () => 'edition-courante-id',
  } as unknown as ChronoStore;
}

function contenusStoreAvec(epreuves: EpreuveParcoursRecord[]) {
  return { listEpreuvesParcours: vi.fn(async () => epreuves) } as unknown as ContenusStore & {
    listEpreuvesParcours: ReturnType<typeof vi.fn>;
  };
}

function epreuve(gpxUrl: string | null): EpreuveParcoursRecord {
  return { id: 'epreuve-id', slug: 'longue', nom: 'La Longue — 35 km', distanceKm: 35, gpxUrl };
}

describe('getTracesPubliques — orchestration (stores + fetch injectés)', () => {
  beforeEach(() => {
    resetCarteCachesForTests();
  });

  it('fetch serveur + parse + échantillonnage ≤ 500 : 50 000 points GPX réduits, extrémités conservées', async () => {
    const segments = Array.from(
      { length: 50_000 },
      (_, index) => `<trkpt lat="${(index / 10_000).toFixed(6)}" lon="${(index / 20_000).toFixed(6)}"/>`,
    ).join('');
    const gpxGeant = `<gpx><trk><trkseg>${segments}</trkseg></trk></gpx>`;
    const fetchGpx = vi.fn(async () => reponseGpx(gpxGeant));
    const resultat = await getTracesPubliques({
      chronoStore: chronoStoreAvec('org-id'),
      contenusStore: contenusStoreAvec([epreuve('https://cdn.azzel.dz/longue.gpx')]),
      fetchGpx,
    });
    expect(resultat.traces).toHaveLength(1);
    const trace = resultat.traces[0] as TracePublique;
    expect(trace.points).toHaveLength(500);
    expect(trace.points[0]!.lat).toBeCloseTo(0, 5);
    expect(trace.points[499]!.lat).toBeCloseTo(4.9999, 3);
    expect(fetchGpx).toHaveBeenCalledTimes(1);
    expect(fetchGpx).toHaveBeenCalledWith('https://cdn.azzel.dz/longue.gpx');
  });

  it('cache mémoire 1 h PAR URL : un deuxième appel ne re-fetch PAS', async () => {
    const fetchGpx = vi.fn(async () => reponseGpx(GPX_FIXTURE));
    const deps = {
      chronoStore: chronoStoreAvec('org-id'),
      contenusStore: contenusStoreAvec([epreuve('https://cdn.azzel.dz/longue.gpx')]),
      fetchGpx,
    };
    await getTracesPubliques(deps);
    await getTracesPubliques(deps);
    expect(fetchGpx).toHaveBeenCalledTimes(1);
  });

  it('GPX 404 : échec ISOLÉ — trace absente, l’autre épreuve servie, jamais d’erreur', async () => {
    const fetchGpx = vi.fn(async (url: string) =>
      url.endsWith('longue.gpx') ? reponseGpx('Pas Found', 404) : reponseGpx(GPX_FIXTURE),
    );
    const resultat = await getTracesPubliques({
      chronoStore: chronoStoreAvec('org-id'),
      contenusStore: contenusStoreAvec([
        epreuve('https://cdn.azzel.dz/longue.gpx'),
        { ...epreuve(null), slug: 'moyenne', nom: 'La Moyenne — 12 km', gpxUrl: 'https://cdn.azzel.dz/moyenne.gpx' },
      ]),
      fetchGpx,
    });
    expect(resultat.traces.map((trace) => trace.epreuveSlug)).toEqual(['moyenne']);
  });

  it('fetch qui JETE (timeout réseau) : échec doux isolé, réponse vide mais 200-side service', async () => {
    const fetchGpx = vi.fn(async () => {
      throw new Error('ETIMEDOUT');
    });
    const resultat = await getTracesPubliques({
      chronoStore: chronoStoreAvec('org-id'),
      contenusStore: contenusStoreAvec([epreuve('https://cdn.azzel.dz/longue.gpx')]),
      fetchGpx,
    });
    expect(resultat.traces).toEqual([]);
  });

  it('épreuves sans gpx_url : jamais fetchées', async () => {
    const fetchGpx = vi.fn(async () => reponseGpx(GPX_FIXTURE));
    const resultat = await getTracesPubliques({
      chronoStore: chronoStoreAvec('org-id'),
      contenusStore: contenusStoreAvec([epreuve(null), epreuve(null)]),
      fetchGpx,
    });
    expect(resultat.traces).toEqual([]);
    expect(fetchGpx).not.toHaveBeenCalled();
  });

  it('sans organisation par défaut : état ZÉRO cohérent, jamais une erreur', async () => {
    const resultat = await getTracesPubliques({
      chronoStore: chronoStoreAvec(null),
      contenusStore: contenusStoreAvec([epreuve('https://cdn.azzel.dz/longue.gpx')]),
      fetchGpx: vi.fn(),
    });
    expect(resultat.traces).toEqual([]);
  });

  it('revue 7.3 — SCOPÉ à l’ÉDITION COURANTE : editionId résolu et passé au contenus store', async () => {
    const contenusStore = contenusStoreAvec([epreuve('https://cdn.azzel.dz/longue.gpx')]);
    await getTracesPubliques({
      chronoStore: chronoStoreAvec('org-id'),
      contenusStore,
      fetchGpx: vi.fn(async () => reponseGpx(GPX_FIXTURE)),
    });
    expect(contenusStore.listEpreuvesParcours).toHaveBeenCalledWith(
      'org-id',
      'edition-courante-id',
    );
  });

  it('revue 7.3 — sans édition courante : état ZÉRO cohérent, contenus store jamais lu', async () => {
    const contenusStore = contenusStoreAvec([epreuve('https://cdn.azzel.dz/longue.gpx')]);
    const chronoStoreSansEdition = {
      organisationParDefautId: async () => 'org-id',
      editionCouranteId: async () => null,
    } as unknown as ChronoStore;
    const resultat = await getTracesPubliques({
      chronoStore: chronoStoreSansEdition,
      contenusStore,
      fetchGpx: vi.fn(),
    });
    expect(resultat.traces).toEqual([]);
    expect(contenusStore.listEpreuvesParcours).not.toHaveBeenCalled();
  });

  it('revue 7.3 — cache NÉGATIF 60 s : une URL morte n’est pas re-fetchée (pas de tempête)', async () => {
    const fetchGpx = vi.fn(async () => reponseGpx('Not Found', 404));
    const deps = {
      chronoStore: chronoStoreAvec('org-id'),
      contenusStore: contenusStoreAvec([epreuve('https://cdn.azzel.dz/morte.gpx')]),
      fetchGpx,
    };
    const premiere = await getTracesPubliques(deps);
    const deuxieme = await getTracesPubliques(deps);
    expect(premiere.traces).toEqual([]);
    expect(deuxieme.traces).toEqual([]);
    expect(fetchGpx).toHaveBeenCalledTimes(1);
    // Le cache négatif expire (tests) : l'URL est re-tentée après reset.
    resetCarteCachesForTests();
    await getTracesPubliques(deps);
    expect(fetchGpx).toHaveBeenCalledTimes(2);
  });

  it('revue 7.3 — garde content-length AVANT text() : GPX annoncé géant refusé sans chargement', async () => {
    // Corps PETIT mais content-length MENTEUR géant : si la garde manquait,
    // le corps serait lu, parsé et la trace SERVIE — l'assertion vide la prouve.
    const fetchGpx = vi.fn(
      async () =>
        new Response(GPX_FIXTURE, {
          status: 200,
          headers: { 'content-length': String(30 * 1024 * 1024) },
        }),
    );
    const resultat = await getTracesPubliques({
      chronoStore: chronoStoreAvec('org-id'),
      contenusStore: contenusStoreAvec([epreuve('https://cdn.azzel.dz/geant.gpx')]),
      fetchGpx,
    });
    expect(resultat.traces).toEqual([]);
  });
});

describe('getPositionsPubliques — micro-cache et estompée serveur', () => {
  beforeEach(() => {
    resetCarteCachesForTests();
  });

  it('estompée calculée SERVEUR (1 h exact = pas encore, 1 h + = oui), genereA ISO', async () => {
    const maintenant = Date.now();
    const trackingStore = {
      dernieresPositions: async () => [
        {
          dossard: 201,
          epreuveSlug: 'longue',
          epreuveNom: 'La Longue — 35 km',
          latitude: 36.5512,
          longitude: 4.3601,
          capteAt: new Date(maintenant - 30 * 60_000),
        },
        {
          dossard: 202,
          epreuveSlug: 'longue',
          epreuveNom: 'La Longue — 35 km',
          latitude: 36.5602,
          longitude: 4.3711,
          capteAt: new Date(maintenant - 3_600_001),
        },
      ],
    } as unknown as TrackingStore;
    const resultat = await getPositionsPubliques({
      chronoStore: chronoStoreAvec('org-id'),
      trackingStore,
    });
    expect(resultat.positions.map((position) => [position.dossard, position.estompée])).toEqual([
      [201, false],
      [202, true],
    ]);
    expect(Number.isNaN(Date.parse(resultat.genereA))).toBe(false);
  });

  it('revue 7.3 — clamp horloge : capteA au-delà de maintenant + 10 min servie ESTOMPÉE', async () => {
    const maintenant = Date.now();
    const trackingStore = {
      dernieresPositions: async () => [
        {
          dossard: 201,
          epreuveSlug: 'longue',
          epreuveNom: 'La Longue — 35 km',
          latitude: 36.5512,
          longitude: 4.3601,
          // Horloge appareil en avance : +5 min = dans la tolérance (pleine),
          // +30 min = hors contrat (estompée, jamais présentée comme fraîche).
          capteAt: new Date(maintenant + 5 * 60_000),
        },
        {
          dossard: 202,
          epreuveSlug: 'longue',
          epreuveNom: 'La Longue — 35 km',
          latitude: 36.5602,
          longitude: 4.3711,
          capteAt: new Date(maintenant + TOLERANCE_HORLOGE_MS + 1),
        },
      ],
    } as unknown as TrackingStore;
    const resultat = await getPositionsPubliques({
      chronoStore: chronoStoreAvec('org-id'),
      trackingStore,
    });
    expect(resultat.positions.map((position) => [position.dossard, position.estompée])).toEqual([
      [201, false],
      [202, true],
    ]);
  });

  it('revue 7.3 — estEstompeeServeur pure : bornes tolérance et 1 h', () => {
    const maintenant = new Date('2027-03-26T10:00:00.000Z');
    expect(estEstompeeServeur(new Date('2027-03-26T09:59:59.000Z'), maintenant)).toBe(false);
    expect(estEstompeeServeur(new Date('2027-03-26T10:10:00.000Z'), maintenant)).toBe(false);
    expect(estEstompeeServeur(new Date('2027-03-26T10:10:01.000Z'), maintenant)).toBe(true);
    expect(estEstompeeServeur(new Date('2027-03-26T08:59:59.000Z'), maintenant)).toBe(true);
  });

  it('micro-cache ~5 s : un deuxième appel immédiat ne relit PAS la base', async () => {
    let lectures = 0;
    const trackingStore = {
      dernieresPositions: async () => {
        lectures += 1;
        return [];
      },
    } as unknown as TrackingStore;
    const deps = { chronoStore: chronoStoreAvec('org-id'), trackingStore };
    await getPositionsPubliques(deps);
    await getPositionsPubliques(deps);
    expect(lectures).toBe(1);
  });

  it('sans organisation par défaut : positions vides, jamais une erreur', async () => {
    const resultat = await getPositionsPubliques({
      chronoStore: chronoStoreAvec(null),
      trackingStore: {} as TrackingStore,
    });
    expect(resultat.positions).toEqual([]);
  });
});
