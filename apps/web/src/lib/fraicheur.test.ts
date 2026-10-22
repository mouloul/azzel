import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE } from '@azzel/shared';

import { libelleHorsLigne, libelleSynchronise } from './fraicheur';

// Story 3.3 — libellés de fraîcheur : le badge dit toujours si les données
// sont synchronisées ou lues depuis la poche. Les attendus sont composés avec
// le MÊME Intl que la lib (déterminisme fuseau du poste de test).

const HEURE = new Intl.DateTimeFormat(DEFAULT_LOCALE, { hour: '2-digit', minute: '2-digit' });
const DATE_HEURE = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const SYNCHRO = '2027-05-16T05:45:00.000Z';

describe('libelleSynchronise', () => {
  it('« synchronisé à HH:MM » en heure locale', () => {
    expect(libelleSynchronise(SYNCHRO)).toBe(`synchronisé à ${HEURE.format(new Date(SYNCHRO))}`);
  });

  it('horodatage invalide : libellé dégradé sans heure, jamais d’exception', () => {
    expect(libelleSynchronise('pas-une-date')).toBe('synchronisé');
  });
});

describe('libelleHorsLigne', () => {
  it('« hors-ligne — données du JJ/MM HH:MM » en heure locale', () => {
    expect(libelleHorsLigne(SYNCHRO)).toBe(
      `hors-ligne — données du ${DATE_HEURE.format(new Date(SYNCHRO))}`,
    );
  });

  it('horodatage invalide : libellé dégradé, jamais d’exception', () => {
    expect(libelleHorsLigne('')).toBe('hors-ligne — données enregistrées');
  });
});
