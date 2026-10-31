import { describe, expect, it } from 'vitest';

import type { EtatVolontaires } from './idb-volontaires';
import { deciderRevalidationEtat, etatLePlusFrais } from './revalidation-etat';

// Revue 3.3 — décision réponse → statut de la fiche volontaire (pure, node) :
// repli du SW (X-Azzel-Source) = hors-ligne, jamais « synchronisé » ; échec en
// ligne = « non rafraîchi » ; 401/403 = bandeau de reconnexion ; payload hors
// contrat ou d'un autre compte = jamais affiché.

const COMPTE = 'account-karim';

function etat(generéA: string, accountId = COMPTE): EtatVolontaires {
  return {
    accountId,
    editionNom: 'Édition 2027',
    assistancePhone: '+213 555 010 200',
    mesMissions: [
      {
        id: 'mission-1',
        secteurNom: 'Village',
        secteurLieu: null,
        secteurContact: null,
        type: 'accueil',
        typeLabel: 'Accueil',
        titre: 'Accueil village',
        debutLe: '2027-05-16T06:00:00.000Z',
        finLe: '2027-05-16T12:00:00.000Z',
        consignes: null,
        estArrivee: false,
        couverture: 'couverte',
        couvertureLabel: 'Couverte',
      },
    ],
    missions: [],
    generéA,
  };
}

describe('deciderRevalidationEtat', () => {
  it('200 réseau, même compte, contrat valide : frais', () => {
    const payload = etat('2026-10-29T08:00:00.000Z');
    expect(deciderRevalidationEtat({ status: 200, source: null, payload }, COMPTE, true)).toEqual({
      issue: 'frais',
      etat: payload,
    });
  });

  it('200 rejoué du cache SW (X-Azzel-Source: cache) : hors-ligne avec la réplique, jamais frais', () => {
    const payload = etat('2026-10-28T08:00:00.000Z');
    expect(
      deciderRevalidationEtat({ status: 200, source: 'cache', payload }, COMPTE, true),
    ).toEqual({ issue: 'repli', statut: 'hors-ligne', replique: payload });
  });

  it('enveloppe 503 du SW (hors-ligne sans cache) : hors-ligne, sans réplique', () => {
    expect(
      deciderRevalidationEtat(
        { status: 503, source: 'hors-ligne', payload: { error: { code: 'volontaires.hors_ligne' } } },
        COMPTE,
        true,
      ),
    ).toEqual({ issue: 'repli', statut: 'hors-ligne', replique: null });
  });

  it('fetch rejeté : hors-ligne si navigator.onLine === false, sinon non rafraîchi', () => {
    expect(deciderRevalidationEtat(null, COMPTE, false)).toEqual({
      issue: 'repli',
      statut: 'hors-ligne',
      replique: null,
    });
    expect(deciderRevalidationEtat(null, COMPTE, true)).toEqual({
      issue: 'repli',
      statut: 'non-rafraichi',
      replique: null,
    });
  });

  it('5xx réseau en ligne (portail captif, serveur) : non rafraîchi', () => {
    expect(
      deciderRevalidationEtat({ status: 502, source: null, payload: null }, COMPTE, true),
    ).toEqual({ issue: 'repli', statut: 'non-rafraichi', replique: null });
  });

  it('401/403 : session expirée (la fiche reste, bandeau de reconnexion)', () => {
    expect(deciderRevalidationEtat({ status: 401, source: null, payload: null }, COMPTE, true)).toEqual({
      issue: 'session-expiree',
    });
    expect(deciderRevalidationEtat({ status: 403, source: null, payload: null }, COMPTE, true)).toEqual({
      issue: 'session-expiree',
    });
  });

  it('200 hors contrat (mission à debutLe invalide) : non rafraîchi, rien d’affiché du payload', () => {
    const payload = {
      ...etat('2026-10-29T08:00:00.000Z'),
      mesMissions: [{ ...etat('x').mesMissions[0], debutLe: 'nimporte' }],
    };
    expect(
      deciderRevalidationEtat({ status: 200, source: null, payload }, COMPTE, true),
    ).toEqual({ issue: 'repli', statut: 'non-rafraichi', replique: null });
  });

  it('état d’un AUTRE compte (réseau ou cache SW) : jamais affiché', () => {
    const autre = etat('2026-10-29T08:00:00.000Z', 'account-nadia');
    expect(
      deciderRevalidationEtat({ status: 200, source: null, payload: autre }, COMPTE, true),
    ).toEqual({ issue: 'repli', statut: 'non-rafraichi', replique: null });
    expect(
      deciderRevalidationEtat({ status: 200, source: 'cache', payload: autre }, COMPTE, true),
    ).toEqual({ issue: 'repli', statut: 'hors-ligne', replique: null });
  });
});

describe('etatLePlusFrais', () => {
  it('garde le plus frais par valeur, ignore null et les autres comptes', () => {
    const ancien = etat('2026-10-28T08:00:00.000Z');
    const frais = etat('2026-10-29T08:00:00+01:00');
    const etranger = etat('2026-12-01T08:00:00.000Z', 'account-nadia');
    expect(etatLePlusFrais([ancien, null, frais, etranger], COMPTE)).toBe(frais);
  });

  it('égalité : le premier candidat gagne ; aucun candidat : null', () => {
    const a = etat('2026-10-28T08:00:00.000Z');
    const b = etat('2026-10-28T08:00:00.000Z');
    expect(etatLePlusFrais([a, b], COMPTE)).toBe(a);
    expect(etatLePlusFrais([null], COMPTE)).toBeNull();
  });
});
