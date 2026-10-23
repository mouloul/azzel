import { describe, expect, it } from 'vitest';

import {
  INTERVALLE_POSITION_MS,
  JOURNAL_SUIVI_MAX_ENTREES,
  POSITION_SCHEMA_VERSION,
  SYNC_POSITION_MAX_LOT,
  cleIdempotencePosition,
  estCorpsLotSyncPositionValide,
  estPositionValide,
  type PositionTerrain,
} from './tracking';

// Story 6.2 — contrat du suivi GPS opt-in : gardes de forme (bornes GPS,
// ISO UTC strict), clé d'idempotence appareil:capteA, bornes du canal sync.
// La constante d'intervalle est FIXE (SM-C2) : 7 minutes, ni configurable ni
// adaptative — c'est la MÊME constante qui cadence le watcher et borne le
// contrat.

function positionValide(surcharge: Partial<PositionTerrain> = {}): PositionTerrain {
  return {
    version: POSITION_SCHEMA_VERSION,
    lat: 36.712345,
    lon: 3.187654,
    capteA: '2027-05-16T07:05:09.000Z',
    ...surcharge,
  };
}

describe('INTERVALLE_POSITION_MS — fréquence FIXE (SM-C2)', () => {
  it('vaut exactement 7 minutes', () => {
    expect(INTERVALLE_POSITION_MS).toBe(7 * 60_000);
  });

  it('vit dans shared : la même constante cadence watcher et contrat', () => {
    expect(INTERVALLE_POSITION_MS).toBe(420_000);
  });
});

describe('bornes du canal sync', () => {
  it('SYNC_POSITION_MAX_LOT = 200, JOURNAL_SUIVI_MAX_ENTREES = 100', () => {
    expect(SYNC_POSITION_MAX_LOT).toBe(200);
    expect(JOURNAL_SUIVI_MAX_ENTREES).toBe(100);
  });
});

describe('estPositionValide', () => {
  it('accepte une position bien formée (bornes incluses)', () => {
    expect(estPositionValide(positionValide())).toBe(true);
    expect(estPositionValide(positionValide({ lat: -90, lon: -180 }))).toBe(true);
    expect(estPositionValide(positionValide({ lat: 90, lon: 180 }))).toBe(true);
    expect(estPositionValide(positionValide({ lat: 0, lon: 0 }))).toBe(true);
  });

  it('refuse lat hors [-90, 90] — la position reste HORS outbox', () => {
    expect(estPositionValide(positionValide({ lat: 90.0001 }))).toBe(false);
    expect(estPositionValide(positionValide({ lat: -90.0001 }))).toBe(false);
  });

  it('refuse lon hors [-180, 180]', () => {
    expect(estPositionValide(positionValide({ lon: 180.0001 }))).toBe(false);
    expect(estPositionValide(positionValide({ lon: -180.0001 }))).toBe(false);
  });

  it('refuse NaN/Infinity (jamais de poison dans l’outbox)', () => {
    expect(estPositionValide(positionValide({ lat: Number.NaN }))).toBe(false);
    expect(estPositionValide(positionValide({ lon: Number.POSITIVE_INFINITY }))).toBe(false);
  });

  it('exige capteA ISO 8601 UTC STRICT (suffixe Z)', () => {
    expect(estPositionValide(positionValide({ capteA: '2027-05-16T07:05:09Z' }))).toBe(true);
    expect(estPositionValide(positionValide({ capteA: '2027-05-16T07:05:09.123Z' }))).toBe(true);
    // Sans Z : interprété en heure LOCALE — piège de fuseau, refusé net.
    expect(estPositionValide(positionValide({ capteA: '2027-05-16T07:05:09' }))).toBe(false);
    expect(estPositionValide(positionValide({ capteA: '2027-05-16T07:05:09+01:00' }))).toBe(false);
    expect(estPositionValide(positionValide({ capteA: 'il y a 7 minutes' }))).toBe(false);
  });

  it('exige la version exacte du contrat', () => {
    expect(estPositionValide({ ...positionValide(), version: 2 })).toBe(false);
    expect(estPositionValide({ ...positionValide(), version: undefined })).toBe(false);
  });

  it('refuse les non-objets', () => {
    expect(estPositionValide(null)).toBe(false);
    expect(estPositionValide('36.7, 3.18')).toBe(false);
    expect(estPositionValide(42)).toBe(false);
  });
});

describe('cleIdempotencePosition', () => {
  it('est déterministe : appareil + instant de capture', () => {
    expect(cleIdempotencePosition('app-1', '2027-05-16T07:05:09.000Z')).toBe(
      cleIdempotencePosition('app-1', '2027-05-16T07:05:09.000Z'),
    );
  });

  it('deux ticks distincts → deux clés DISTINCTES (même appareil)', () => {
    const premiere = cleIdempotencePosition('app-1', '2027-05-16T07:05:09.000Z');
    const seconde = cleIdempotencePosition('app-1', '2027-05-16T07:12:09.000Z');
    expect(premiere).not.toBe(seconde);
  });

  it('deux appareils au même instant → clés distinctes', () => {
    expect(cleIdempotencePosition('app-1', '2027-05-16T07:05:09.000Z')).not.toBe(
      cleIdempotencePosition('app-2', '2027-05-16T07:05:09.000Z'),
    );
  });

  it('porte le préfixe type+version (cohabitation des contrats)', () => {
    expect(cleIdempotencePosition('app-1', '2027-05-16T07:05:09.000Z')).toBe(
      'position:v1:app-1:2027-05-16T07:05:09.000Z',
    );
  });
});

describe('estCorpsLotSyncPositionValide', () => {
  it('accepte { appareilId, positions } (lot vide permis)', () => {
    expect(estCorpsLotSyncPositionValide({ appareilId: 'app-1', positions: [] })).toBe(true);
    expect(
      estCorpsLotSyncPositionValide({ appareilId: 'app-1', positions: [positionValide()] }),
    ).toBe(true);
  });

  it('refuse appareilId absent/vide/trop long', () => {
    expect(estCorpsLotSyncPositionValide({ positions: [] })).toBe(false);
    expect(estCorpsLotSyncPositionValide({ appareilId: '', positions: [] })).toBe(false);
    expect(estCorpsLotSyncPositionValide({ appareilId: '   ', positions: [] })).toBe(false);
    expect(
      estCorpsLotSyncPositionValide({ appareilId: 'x'.repeat(121), positions: [] }),
    ).toBe(false);
  });

  it('refuse positions non-tableau (le lot devient illisible)', () => {
    expect(estCorpsLotSyncPositionValide({ appareilId: 'app-1' })).toBe(false);
    expect(estCorpsLotSyncPositionValide({ appareilId: 'app-1', positions: {} })).toBe(false);
  });

  it('les positions HORS contrat ne rendent PAS le lot illisible', () => {
    expect(
      estCorpsLotSyncPositionValide({
        appareilId: 'app-1',
        positions: [{ pourri: true }, positionValide()],
      }),
    ).toBe(true);
  });

  it('refuse les non-objets', () => {
    expect(estCorpsLotSyncPositionValide(null)).toBe(false);
    expect(estCorpsLotSyncPositionValide('lot')).toBe(false);
  });
});
