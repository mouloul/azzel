import { describe, expect, it } from 'vitest';

import { alerteDeconnexion } from './deconnexion';

/* I10 (revue épopée 10) — la déconnexion est destructive (purge token +
 * session + cache e-dossard + file des positions, NFR-6) : elle exige une
 * confirmation dont le message dit ce qui est RÉELLEMENT perdu, selon
 * l'état de l'appareil. Fonction pure — App.tsx la présente via Alert.alert. */

describe('alerteDeconnexion — libellés de la confirmation native', () => {
  it('titre et boutons invariants : « Annuler » (annulation) / « Me déconnecter » (destructif, seul confirmant)', () => {
    for (const choix of [
      { aEdossard: true, positionsEnAttente: 0 },
      { aEdossard: false, positionsEnAttente: 3 },
      { aEdossard: false, positionsEnAttente: 0 },
    ]) {
      const alerte = alerteDeconnexion(choix);
      expect(alerte.titre).toBe('Supprimer ton e-dossard de ce téléphone ?');
      expect(alerte.boutons).toEqual([
        { texte: 'Annuler', style: 'cancel', confirme: false },
        { texte: 'Me déconnecter', style: 'destructive', confirme: true },
      ]);
    }
  });

  it('e-dossard présent : le message nomme la perte de l’e-dossard hors-ligne', () => {
    expect(alerteDeconnexion({ aEdossard: true, positionsEnAttente: 0 }).message).toBe(
      'Tu vas perdre ton e-dossard hors-ligne enregistré sur ce téléphone.',
    );
  });

  it('file de positions : le message nomme la perte, au singulier comme au pluriel', () => {
    expect(alerteDeconnexion({ aEdossard: false, positionsEnAttente: 1 }).message).toBe(
      'Tu vas perdre 1 position en attente d’envoi enregistrée sur ce téléphone.',
    );
    expect(alerteDeconnexion({ aEdossard: false, positionsEnAttente: 4 }).message).toBe(
      'Tu vas perdre 4 positions en attente d’envoi enregistrées sur ce téléphone.',
    );
  });

  it('e-dossard ET positions : les deux pertes sont dites', () => {
    expect(alerteDeconnexion({ aEdossard: true, positionsEnAttente: 2 }).message).toBe(
      'Tu vas perdre ton e-dossard hors-ligne et 2 positions en attente d’envoi enregistrés sur ce téléphone.',
    );
  });

  it('rien à perdre : message factuel, jamais une liste vide', () => {
    expect(alerteDeconnexion({ aEdossard: false, positionsEnAttente: 0 }).message).toBe(
      'Ta session et les données de ce téléphone seront supprimées.',
    );
  });
});
