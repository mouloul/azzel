import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FUSEAU_PRODUIT,
  datetimeLocalVersIso,
  estHorodatageValide,
  formatLocalDate,
  formatLocalDateTime,
  formatLocalHeure,
  formatLocalTime,
  isoVersDatetimeLocal,
} from './datetime';

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'UTC';
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

/** Exécute `run` avec le fuseau du PROCESSUS forcé (TZ restauré à UTC ensuite). */
function sousFuseauProcessus<T>(fuseau: string, run: () => T): T {
  process.env.TZ = fuseau;
  try {
    return run();
  } finally {
    process.env.TZ = 'UTC';
  }
}

// Décision D1 (revue 3.2) : affichage et saisie à l'heure du TERRAIN (fuseau
// produit Africa/Algiers, UTC+1 sans heure d'été), jamais celle de la machine.
const FUSEAUX_PROCESSUS = ['UTC', 'America/New_York', 'Asia/Tokyo'];

describe.skipIf(process.platform === 'win32')('horodatages ISO 8601 UTC → affichage fuseau produit', () => {
  const isoUtc = '2026-03-26T08:42:07.000Z';

  it('le fuseau produit est Africa/Algiers', () => {
    expect(FUSEAU_PRODUIT).toBe('Africa/Algiers');
  });

  it.each(FUSEAUX_PROCESSUS)('processus en %s : heure d’Alger (UTC+1), jamais celle de la machine', (fuseau) => {
    sousFuseauProcessus(fuseau, () => {
      expect(formatLocalTime(isoUtc)).toBe('09:42:07');
      expect(formatLocalDate(isoUtc)).toBe('26 mars 2026');
      expect(formatLocalDateTime(isoUtc)).toBe('26 mars 2026 à 09:42');
      expect(formatLocalHeure(isoUtc)).toBe('09:42');
      // Passage de minuit : 23:59 Z = 00:59 le lendemain à Alger.
      expect(formatLocalHeure('2026-03-26T23:59:00.000Z')).toBe('00:59');
      expect(formatLocalDate('2026-03-26T23:59:00.000Z')).toBe('27 mars 2026');
    });
  });

  it('été comme hiver : toujours UTC+1 (aucune heure d’été en Algérie)', () => {
    expect(formatLocalHeure('2027-07-16T06:00:00.000Z')).toBe('07:00');
    expect(formatLocalHeure('2027-01-16T06:00:00.000Z')).toBe('07:00');
  });

  it('rejette un horodatage invalide avec un message explicite', () => {
    expect(() => formatLocalTime('26/03/2027')).toThrow(RangeError);
  });
});

// Contrat horodatage transverse (déplacé de missions — TZ épinglé ci-dessus).

describe('estHorodatageValide — RFC3339 STRICT en Z, refus des formes ambiguës', () => {
  it('accepte secondes et fractions facultatives, toujours Z', () => {
    expect(estHorodatageValide('2027-05-16T06:00Z')).toBe(true);
    expect(estHorodatageValide('2027-05-16T06:00:00Z')).toBe(true);
    expect(estHorodatageValide('2027-05-16T06:00:00.000Z')).toBe(true);
  });

  it('refuse année seule, sans Z (heure locale serveur), décalage explicite, espace, date impossible', () => {
    expect(estHorodatageValide('2027')).toBe(false);
    expect(estHorodatageValide('2027-05-16T06:00')).toBe(false);
    expect(estHorodatageValide('2027-05-16T06:00:00')).toBe(false);
    expect(estHorodatageValide('2027-05-16T06:00:00+02:00')).toBe(false);
    expect(estHorodatageValide('2027-05-16 06:00:00Z')).toBe(false);
    expect(estHorodatageValide('16/05/2027')).toBe(false);
    expect(estHorodatageValide('2027-13-45T99:99:00Z')).toBe(false);
    expect(estHorodatageValide('')).toBe(false);
  });
});

describe('helpers datetime-local — heure murale d’Alger, valeurs absolues', () => {
  it.each(FUSEAUX_PROCESSUS)('processus en %s : résultats identiques', (fuseau) => {
    sousFuseauProcessus(fuseau, () => {
      expect(isoVersDatetimeLocal('2027-05-16T06:00:00.000Z')).toBe('2027-05-16T07:00');
      expect(datetimeLocalVersIso('2027-05-16T07:00')).toBe('2027-05-16T06:00:00.000Z');
      // Bascule de jour : 23:30 Z = 00:30 le lendemain à Alger (et retour).
      expect(isoVersDatetimeLocal('2027-12-31T23:30:00.000Z')).toBe('2028-01-01T00:30');
      expect(datetimeLocalVersIso('2028-01-01T00:30')).toBe('2027-12-31T23:30:00.000Z');
      // Secondes facultatives de l'input datetime-local.
      expect(datetimeLocalVersIso('2027-05-16T07:00:30')).toBe('2027-05-16T06:00:30.000Z');
    });
  });
});

describe('helpers datetime-local — aller-retour UTC → locale → UTC (même instant)', () => {
  it('isoVersDatetimeLocal puis datetimeLocalVersIso restitue l’instant exact', () => {
    for (const iso of [
      '2027-05-16T06:00:00.000Z',
      '2027-12-31T23:59:00.000Z',
      '2027-01-01T00:01:00.000Z',
      '2027-05-16T22:30:00.000Z',
    ]) {
      expect(datetimeLocalVersIso(isoVersDatetimeLocal(iso))).toBe(iso);
    }
  });

  it('isoVersDatetimeLocal : valeur d’input datetime-local bien formée ; invalide → vide', () => {
    expect(isoVersDatetimeLocal('2027-05-16T06:05:07.000Z')).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
    expect(isoVersDatetimeLocal('pas-une-date')).toBe('');
    expect(datetimeLocalVersIso('nimporte')).toBe('');
    expect(datetimeLocalVersIso('')).toBe('');
    // Forme ambiguë (avec Z / décalage) : refusée, jamais réinterprétée.
    expect(datetimeLocalVersIso('2027-05-16T07:00Z')).toBe('');
  });
});
