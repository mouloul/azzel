import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formatLocalDate, formatLocalDateTime, formatLocalTime } from './datetime';

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

  it('rejette un horodatage invalide avec un message explicite', () => {
    expect(() => formatLocalTime('26/03/2027')).toThrow(RangeError);
  });
});
