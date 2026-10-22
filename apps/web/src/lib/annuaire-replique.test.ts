import { describe, expect, it } from 'vitest';

import { ANNUAIRE_SCHEMA_VERSION, type AnnuaireEdition } from '@azzel/shared';

import { resoudreAnnuaireHorsLigne } from './annuaire-replique';

// Story 3.4 (revue) — résolution du repli annuaire : le plus frais gagne
// (comparaison par Date.getTime(), PAS lexicographique), IDB null → amorce,
// aucun → indisponible, hors-ligne réservé au réseau réellement coupé.

function annuaire(genereA: string, coureurs = 1): AnnuaireEdition {
  return {
    version: ANNUAIRE_SCHEMA_VERSION,
    editionId: 'edition-1',
    genereA,
    coureurs:
      coureurs === 0
        ? []
        : Array.from({ length: coureurs }, (_, index) => ({
            dossard: index + 1,
            nom: `Nom${index}`,
            prenom: `Prenom${index}`,
          })),
  };
}

describe('resoudreAnnuaireHorsLigne — le plus frais gagne', () => {
  it('initial plus frais que la poche : il gagne (et l’appelant réécrit la poche)', () => {
    const enCache = annuaire('2026-10-22T08:00:00Z');
    const initial = annuaire('2026-10-22T09:30:00.000Z');
    const choix = resoudreAnnuaireHorsLigne(enCache, initial, true);
    expect(choix.annuaire).toBe(initial);
    expect(choix.statut).toBe('pret');
  });

  it('comparaison par valeur, pas lexicographique : fraction de sortie piège l’ordre des chaînes', () => {
    // Lexicographiquement '…08:00:00.500Z' < '…08:00:00Z' ('.' < 'Z') alors
    // que .500 est PLUS RÉCENT : c'est lui qui doit gagner.
    const enCache = annuaire('2026-10-22T08:00:00Z');
    const initial = annuaire('2026-10-22T08:00:00.500Z');
    expect(resoudreAnnuaireHorsLigne(enCache, initial, true).annuaire).toBe(initial);
  });

  it('poche plus fraîche : elle gagne, l’état serveur est ignoré', () => {
    const enCache = annuaire('2026-10-22T10:00:00.000Z');
    const initial = annuaire('2026-10-22T08:00:00.000Z');
    expect(resoudreAnnuaireHorsLigne(enCache, initial, true).annuaire).toBe(enCache);
  });

  it('horodatages égaux : la poche reste (pas de réécriture inutile)', () => {
    const enCache = annuaire('2026-10-22T08:00:00.000Z');
    const initial = annuaire('2026-10-22T08:00:00.000Z');
    expect(resoudreAnnuaireHorsLigne(enCache, initial, true).annuaire).toBe(enCache);
  });

  it('horodatage invalide unilatéral : l’autre annuaire gagne', () => {
    const enCache = annuaire('pas-une-date');
    const initial = annuaire('2026-10-22T08:00:00.000Z');
    expect(resoudreAnnuaireHorsLigne(enCache, initial, true).annuaire).toBe(initial);
  });
});

describe('resoudreAnnuaireHorsLigne — amorce et dégradation', () => {
  it('IDB vide, état serveur présent : amorce (pret en ligne, hors-ligne réseau coupé)', () => {
    const initial = annuaire('2026-10-22T08:00:00.000Z');
    expect(resoudreAnnuaireHorsLigne(null, initial, true)).toEqual({
      annuaire: initial,
      statut: 'pret',
    });
    expect(resoudreAnnuaireHorsLigne(null, initial, false)).toEqual({
      annuaire: initial,
      statut: 'hors-ligne',
    });
  });

  it('aucun annuaire nulle part : indisponible', () => {
    expect(resoudreAnnuaireHorsLigne(null, null, true)).toEqual({
      annuaire: null,
      statut: 'indisponible',
    });
    expect(resoudreAnnuaireHorsLigne(null, null, false)).toEqual({
      annuaire: null,
      statut: 'indisponible',
    });
  });

  it('gagnant sans coureur à dossard : « aucun », même hors-ligne', () => {
    const enCache = annuaire('2026-10-22T08:00:00.000Z', 0);
    const initial = annuaire('2026-10-22T07:00:00.000Z', 3);
    expect(resoudreAnnuaireHorsLigne(enCache, initial, false)).toEqual({
      annuaire: enCache,
      statut: 'aucun',
    });
  });

  it('5xx en ligne (réseau présent) : jamais « hors-ligne », le plus frais reste prêt', () => {
    const enCache = annuaire('2026-10-22T08:00:00.000Z');
    const choix = resoudreAnnuaireHorsLigne(enCache, null, true);
    expect(choix.statut).toBe('pret');
  });

  it('réseau réellement coupé avec coureurs en poche : « hors-ligne »', () => {
    const enCache = annuaire('2026-10-22T08:00:00.000Z', 5);
    expect(resoudreAnnuaireHorsLigne(enCache, null, false).statut).toBe('hors-ligne');
  });
});
