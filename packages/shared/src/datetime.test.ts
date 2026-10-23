import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
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

describe.skipIf(process.platform === 'win32')('horodatages ISO 8601 UTC → affichage local', () => {
  const isoUtc = '2026-03-26T08:42:07.000Z';

  it('affiche l’heure locale à partir d’un instant UTC', () => {
    expect(formatLocalTime(isoUtc)).toBe('08:42:07');
  });

  it('affiche la date locale en français', () => {
    expect(formatLocalDate(isoUtc)).toBe('26 mars 2026');
  });

  it('affiche date et heure ensemble', () => {
    expect(formatLocalDateTime(isoUtc)).toBe('26 mars 2026 à 08:42');
  });

  it('affiche l’heure locale HH:MM (story 5.2 — barrières horaires)', () => {
    expect(formatLocalHeure(isoUtc)).toBe('08:42');
    expect(formatLocalHeure('2026-03-26T23:59:00.000Z')).toBe('23:59');
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
  });
});
