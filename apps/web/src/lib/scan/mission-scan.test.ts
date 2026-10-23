import { describe, expect, it } from 'vitest';

import type { MissionVolontaireView } from '@/modules/missions/service';

import { missionRetraitEnCours, missionScanEnCours, missionTypeEnCours } from './mission-scan';

// Story 4.2 (revue) — résolution de la mission scan en cours : fenêtre
// courante d'abord, repli première mission scan, null sans mission scan.
// Story 4.3 — généralisation aux types : le mode retrait est débloqué par une
// mission distribution_dossards « en cours » (même fenêtre horaire).

type TypeEssai = 'scan_checkpoint' | 'distribution_dossards' | 'accueil';

function mission(
  id: string,
  type: TypeEssai,
  debutHeure = 6,
  finHeure = 12,
): MissionVolontaireView {
  return {
    id,
    secteurNom: 'Village',
    secteurLieu: null,
    secteurContact: null,
    type,
    typeLabel: type,
    titre: `Mission ${id}`,
    debutLe: new Date(2027, 4, 16, debutHeure, 0, 0).toISOString(),
    finLe: new Date(2027, 4, 16, finHeure, 0, 0).toISOString(),
    consignes: null,
    estArrivee: false,
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

  it('bornes incluses : debutLe ≤ now ≤ finLe', () => {
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

describe('missionTypeEnCours — généralisation aux types (story 4.3)', () => {
  it('mission distribution_dossards : fenêtre courante gagne, repli première du type', () => {
    expect(
      missionTypeEnCours(
        [mission('guichet-hors', 'distribution_dossards', 13, 18), mission('guichet', 'distribution_dossards', 6, 12)],
        'distribution_dossards',
        MAINTENANT,
      )?.id,
    ).toBe('guichet');
    expect(
      missionTypeEnCours(
        [mission('guichet', 'distribution_dossards', 13, 18)],
        'distribution_dossards',
        MAINTENANT,
      )?.id,
    ).toBe('guichet');
  });

  it('un volontaire scan ET guichet : chaque type résout SA mission', () => {
    const mesMissions = [
      mission('scan-km12', 'scan_checkpoint', 6, 12),
      mission('guichet', 'distribution_dossards', 5, 11),
    ];
    expect(missionScanEnCours(mesMissions, MAINTENANT)?.id).toBe('scan-km12');
    expect(missionRetraitEnCours(mesMissions, MAINTENANT)?.id).toBe('guichet');
  });

  it('null quand le type demandé est absent (le mode retrait reste fermé)', () => {
    expect(
      missionRetraitEnCours([mission('scan-km12', 'scan_checkpoint', 6, 12)], MAINTENANT),
    ).toBeNull();
    expect(missionRetraitEnCours([], MAINTENANT)).toBeNull();
  });
});
