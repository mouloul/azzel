import { describe, expect, it } from 'vitest';

import { missionScanEnCours } from './mission-scan';

// Story 4.2 (revue) — résolution de la mission scan en cours : fenêtre
// courante d'abord, repli première mission scan, null sans mission scan.

function mission(id: string, type: 'scan_checkpoint' | 'accueil', debutHeure = 6, finHeure = 12) {
  return {
    id,
    secteurNom: 'Village',
    secteurLieu: null,
    secteurContact: null,
    type,
    typeLabel: type === 'scan_checkpoint' ? 'Scan checkpoint' : 'Accueil',
    titre: `Mission ${id}`,
    debutLe: new Date(2027, 4, 16, debutHeure, 0, 0).toISOString(),
    finLe: new Date(2027, 4, 16, finHeure, 0, 0).toISOString(),
    consignes: null,
    couverture: 'couverte' as const,
    couvertureLabel: 'Couverte',
  };
}

const MAINTENANT = new Date(2027, 4, 16, 9, 0, 0);

describe('missionScanEnCours', () => {
  it('la mission scan dont la fenêtre contient l’instant gagne (ordre de la liste ignoré)', () => {
    const resultat = missionScanEnCours(
      [mission('hors-fenetre', 'scan_checkpoint', 13, 18), mission('courante', 'scan_checkpoint', 6, 12)],
      MAINTENANT,
    );
    expect(resultat?.id).toBe('courante');
  });

  it('repli : aucune fenêtre courante → la PREMIÈRE mission scan de la liste', () => {
    const resultat = missionScanEnCours(
      [mission('premiere', 'scan_checkpoint', 13, 18), mission('seconde', 'scan_checkpoint', 14, 19)],
      MAINTENANT,
    );
    expect(resultat?.id).toBe('premiere');
  });

  it('bornes inclusives : debutLe ≤ now ≤ finLe', () => {
    expect(
      missionScanEnCours([mission('borne', 'scan_checkpoint', 6, 12)], new Date(2027, 4, 16, 6, 0, 0))
        ?.id,
    ).toBe('borne');
    expect(
      missionScanEnCours([mission('borne', 'scan_checkpoint', 6, 12)], new Date(2027, 4, 16, 12, 0, 0))
        ?.id,
    ).toBe('borne');
  });

  it('null sans aucune mission scan_checkpoint (les autres types ne comptent pas)', () => {
    expect(missionScanEnCours([mission('accueil', 'accueil')], MAINTENANT)).toBeNull();
    expect(missionScanEnCours([], MAINTENANT)).toBeNull();
  });
});
