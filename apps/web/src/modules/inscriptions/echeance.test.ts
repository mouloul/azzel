import { describe, expect, it } from 'vitest';

import { estExpiree, limitePreuve } from './domain';

/**
 * Toutes les échéances sont exprimées en heure d'Alger (fuseau de la course),
 * jamais en heure du serveur : un serveur à Francfort ne doit pas couper les
 * inscriptions une heure trop tôt.
 */
describe('limitePreuve — fin du surlendemain, heure d’Alger', () => {
  it('le cas du PO : inscrit mercredi 13h → vendredi 23h59', () => {
    // 12:00 UTC = 13:00 à Alger (UTC+1), mercredi 24 mars 2027.
    const limite = limitePreuve(new Date('2027-03-24T12:00:00Z'), 2);
    // 22:59:59.999 UTC = 23:59:59.999 à Alger, vendredi 26.
    expect(limite.toISOString()).toBe('2027-03-26T22:59:59.999Z');
  });

  it('inscription juste après minuit heure d’Alger : le jour local compte, pas le jour UTC', () => {
    // 23:30 UTC le 24 = 00:30 à Alger le 25 (jeudi) → limite samedi 27.
    const limite = limitePreuve(new Date('2027-03-24T23:30:00Z'), 2);
    expect(limite.toISOString()).toBe('2027-03-27T22:59:59.999Z');
  });

  it('inscription à 23h59 heure d’Alger : deux jours pleins restent', () => {
    const limite = limitePreuve(new Date('2027-03-24T22:59:00Z'), 2);
    expect(limite.toISOString()).toBe('2027-03-26T22:59:59.999Z');
  });

  it('passage de mois', () => {
    const limite = limitePreuve(new Date('2027-01-30T10:00:00Z'), 2);
    expect(limite.toISOString()).toBe('2027-02-01T22:59:59.999Z');
  });

  it('passage d’année', () => {
    const limite = limitePreuve(new Date('2026-12-30T10:00:00Z'), 2);
    expect(limite.toISOString()).toBe('2027-01-01T22:59:59.999Z');
  });

  it('année bissextile : le 29 février existe', () => {
    const limite = limitePreuve(new Date('2028-02-27T10:00:00Z'), 2);
    expect(limite.toISOString()).toBe('2028-02-29T22:59:59.999Z');
  });

  it('délai de zéro jour : fin du jour même', () => {
    const limite = limitePreuve(new Date('2027-03-24T12:00:00Z'), 0);
    expect(limite.toISOString()).toBe('2027-03-24T22:59:59.999Z');
  });
});

describe('estExpiree — la seconde près', () => {
  const limite = new Date('2027-03-26T22:59:59.999Z');

  it('une milliseconde avant la limite : encore dans les temps', () => {
    expect(estExpiree(limite, new Date('2027-03-26T22:59:59.998Z'))).toBe(false);
  });

  it('pile à la limite : encore dans les temps — la limite est incluse', () => {
    expect(estExpiree(limite, limite)).toBe(false);
  });

  it('une milliseconde après : expirée', () => {
    expect(estExpiree(limite, new Date('2027-03-27T00:00:00.000Z'))).toBe(true);
  });

  it('aucune limite enregistrée : jamais expirée — on ne supprime pas sur une absence', () => {
    expect(estExpiree(null, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });
});
