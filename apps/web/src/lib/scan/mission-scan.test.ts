import { describe, expect, it } from 'vitest';

import type { MissionVolontaireView } from '@/modules/missions/service';

import {
  TOLERANCE_CRENEAU_MS,
  resoudreMissionRetrait,
  resoudreMissionScan,
  type ResolutionMission,
} from './mission-scan';

// Story 4.2 (revue) — résolution de la mission scan en cours : fenêtre
// courante d'abord, repli première mission scan, null sans mission scan.
// Story 4.3 — généralisation aux types (mode retrait débloqué par une mission
// distribution_dossards).
// Story 4.6 — le repli « première de la liste » devient FAUX dès qu'un
// volontaire tient deux missions du même type : à 13h entre deux créneaux, un
// passage partait sur le premier checkpoint. La résolution refuse désormais de
// deviner — elle bloque, et le PC corrige l'affectation.

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

function a(heure: number, minute = 0): Date {
  return new Date(2027, 4, 16, heure, minute, 0);
}

const MAINTENANT = a(9);

/** Identifiant résolu, ou la raison du blocage — pour des attentes lisibles. */
function verdict(resolution: ResolutionMission | null): string {
  if (resolution === null) {
    return 'aucune-mission';
  }
  return resolution.ok ? resolution.mission.id : `bloque:${resolution.raison}`;
}

describe('resoudreMissionScan — mission unique (cas majoritaire, inchangé)', () => {
  const seule = [mission('cp1', 'scan_checkpoint', 9, 12)];

  it('dans sa fenêtre : résolue', () => {
    expect(verdict(resoudreMissionScan(seule, a(10, 30)))).toBe('cp1');
  });

  it('AVANT sa fenêtre : résolue quand même (préparation avant la course)', () => {
    expect(verdict(resoudreMissionScan(seule, a(7)))).toBe('cp1');
  });

  it('bien APRÈS sa fenêtre : résolue quand même — une seule mission n’est jamais ambiguë', () => {
    expect(verdict(resoudreMissionScan(seule, a(20)))).toBe('cp1');
  });

  it('bornes incluses : debutLe ≤ maintenant ≤ finLe', () => {
    expect(verdict(resoudreMissionScan(seule, a(9)))).toBe('cp1');
    expect(verdict(resoudreMissionScan(seule, a(12)))).toBe('cp1');
  });
});

describe('resoudreMissionScan — plusieurs missions : la fenêtre décide, jamais l’ordre', () => {
  // CP1 9h–12h puis CP4 14h–18h : le cas décrit par l'organisation.
  const deux = [
    mission('cp1', 'scan_checkpoint', 9, 12),
    mission('cp4', 'scan_checkpoint', 14, 18),
  ];

  it('une seule en fenêtre : c’est elle, quel que soit son rang', () => {
    expect(verdict(resoudreMissionScan(deux, a(10, 30)))).toBe('cp1');
    expect(verdict(resoudreMissionScan(deux, a(15)))).toBe('cp4');
  });

  it('débordement : jusqu’à 30 min après finLe, la mission tient encore', () => {
    expect(verdict(resoudreMissionScan(deux, a(12, 20)))).toBe('cp1');
    expect(verdict(resoudreMissionScan(deux, a(12, 30)))).toBe('cp1');
  });

  it('arrivée en avance : jusqu’à 30 min avant debutLe, la suivante est prise', () => {
    expect(verdict(resoudreMissionScan(deux, a(13, 45)))).toBe('cp4');
    expect(verdict(resoudreMissionScan(deux, a(13, 30)))).toBe('cp4');
  });

  it('creux franc (écart > 2 h) : AUCUNE candidate → blocage, jamais la première de la liste', () => {
    // CP1 9h–12h puis CP4 16h–18h : à 13h30, les deux tolérances sont passées.
    const ecartes = [
      mission('cp1', 'scan_checkpoint', 9, 12),
      mission('cp4', 'scan_checkpoint', 16, 18),
    ];
    expect(verdict(resoudreMissionScan(ecartes, a(13, 30)))).toBe('bloque:hors-creneau');
  });

  it('écart de 2 h : un vrai creux subsiste entre les deux tolérances', () => {
    // ±30 min : CP1 tient jusqu'à 12h30, CP4 prend à partir de 13h30, et
    // entre les deux personne ne peut dire où se trouve le volontaire.
    expect(verdict(resoudreMissionScan(deux, a(12, 30)))).toBe('cp1');
    expect(verdict(resoudreMissionScan(deux, a(12, 31)))).toBe('bloque:hors-creneau');
    expect(verdict(resoudreMissionScan(deux, a(13)))).toBe('bloque:hors-creneau');
    expect(verdict(resoudreMissionScan(deux, a(13, 29)))).toBe('bloque:hors-creneau');
    expect(verdict(resoudreMissionScan(deux, a(13, 30)))).toBe('cp4');
  });

  it('bien après la dernière : blocage aussi', () => {
    expect(verdict(resoudreMissionScan(deux, a(19, 30)))).toBe('bloque:hors-creneau');
  });

  it('le blocage hors créneau nomme les missions, pour savoir quand revenir', () => {
    const resolution = resoudreMissionScan(deux, a(19, 30));
    expect(resolution?.ok).toBe(false);
    expect(resolution !== null && !resolution.ok && resolution.missions.map((m) => m.id)).toEqual([
      'cp1',
      'cp4',
    ]);
  });
});

describe('resoudreMissionScan — ambiguïté : blocage, jamais un choix arbitraire', () => {
  it('chevauchement réel (avertissement d’affectation ignoré) : blocage', () => {
    const chevauchantes = [
      mission('cp1', 'scan_checkpoint', 9, 12),
      mission('cp4', 'scan_checkpoint', 11, 14),
    ];
    expect(verdict(resoudreMissionScan(chevauchantes, a(11, 30)))).toBe('bloque:chevauchement');
  });

  it('le blocage de chevauchement ne nomme QUE les missions en cause', () => {
    const trois = [
      mission('cp1', 'scan_checkpoint', 9, 12),
      mission('cp4', 'scan_checkpoint', 11, 14),
      mission('cp9', 'scan_checkpoint', 20, 22),
    ];
    const resolution = resoudreMissionScan(trois, a(11, 30));
    expect(resolution !== null && !resolution.ok && resolution.missions.map((m) => m.id)).toEqual([
      'cp1',
      'cp4',
    ]);
  });

  it('tolérances qui se recouvrent (créneaux espacés de moins d’une heure) : blocage', () => {
    const serrees = [
      mission('cp1', 'scan_checkpoint', 9, 12),
      mission('cp4', 'scan_checkpoint', 12, 16),
    ];
    // 12h00 : fin de l'une, début de l'autre — les deux fenêtres EXACTES se
    // valent, personne ne peut trancher.
    expect(verdict(resoudreMissionScan(serrees, a(12)))).toBe('bloque:chevauchement');
    // 12h15 : hors des deux fenêtres mais dans les deux tolérances.
    const presque = [
      mission('cp1', 'scan_checkpoint', 9, 12),
      mission('cp4', 'scan_checkpoint', 12, 16),
    ];
    expect(verdict(resoudreMissionScan(presque, a(12)))).toBe('bloque:chevauchement');
  });
});

describe('resoudreMissionScan — le résultat ne dépend jamais de l’ordre d’entrée', () => {
  const cas: { nom: string; missions: MissionVolontaireView[]; instant: Date }[] = [
    {
      nom: 'une en fenêtre',
      missions: [mission('cp1', 'scan_checkpoint', 9, 12), mission('cp4', 'scan_checkpoint', 14, 18)],
      instant: a(10),
    },
    {
      nom: 'creux',
      missions: [mission('cp1', 'scan_checkpoint', 9, 12), mission('cp4', 'scan_checkpoint', 16, 18)],
      instant: a(13, 30),
    },
    {
      nom: 'débordement',
      missions: [mission('cp1', 'scan_checkpoint', 9, 12), mission('cp4', 'scan_checkpoint', 14, 18)],
      instant: a(12, 20),
    },
    {
      nom: 'chevauchement',
      missions: [mission('cp1', 'scan_checkpoint', 9, 12), mission('cp4', 'scan_checkpoint', 11, 14)],
      instant: a(11, 30),
    },
  ];

  // C'est CE test qui empêche le retour du « premier de la liste » : la même
  // situation, lue à l'envers, doit donner le même verdict.
  it.each(cas)('$nom : liste inversée, même verdict', ({ missions, instant }) => {
    const endroit = verdict(resoudreMissionScan(missions, instant));
    const envers = verdict(resoudreMissionScan([...missions].reverse(), instant));
    expect(envers).toBe(endroit);
  });
});

describe('resoudreMissionScan / resoudreMissionRetrait — familles séparées', () => {
  it('aucune mission du type : null, le mode reste fermé (gating 4.3/4.4 inchangé)', () => {
    expect(resoudreMissionScan([mission('accueil', 'accueil')], MAINTENANT)).toBeNull();
    expect(resoudreMissionScan([], MAINTENANT)).toBeNull();
    expect(
      resoudreMissionRetrait([mission('cp1', 'scan_checkpoint', 9, 12)], MAINTENANT),
    ).toBeNull();
  });

  it('un volontaire guichet ET checkpoint : chaque famille résout la sienne', () => {
    const mesMissions = [
      mission('cp1', 'scan_checkpoint', 6, 12),
      mission('guichet', 'distribution_dossards', 5, 11),
    ];
    expect(verdict(resoudreMissionScan(mesMissions, MAINTENANT))).toBe('cp1');
    expect(verdict(resoudreMissionRetrait(mesMissions, MAINTENANT))).toBe('guichet');
  });

  it('guichet et checkpoint qui se chevauchent : AUCUN blocage, ce sont deux scanners', () => {
    const mesMissions = [
      mission('guichet', 'distribution_dossards', 8, 10),
      mission('cp1', 'scan_checkpoint', 9, 12),
    ];
    expect(verdict(resoudreMissionScan(mesMissions, a(9, 30)))).toBe('cp1');
    expect(verdict(resoudreMissionRetrait(mesMissions, a(9, 30)))).toBe('guichet');
  });

  it('le mode retrait applique les MÊMES règles que le scan', () => {
    const deuxGuichets = [
      mission('g1', 'distribution_dossards', 9, 12),
      mission('g2', 'distribution_dossards', 14, 18),
    ];
    expect(verdict(resoudreMissionRetrait(deuxGuichets, a(19, 30)))).toBe('bloque:hors-creneau');
    expect(verdict(resoudreMissionRetrait(deuxGuichets, a(12, 20)))).toBe('g1');
  });
});

describe('TOLERANCE_CRENEAU_MS', () => {
  it('vaut 30 minutes, exportée pour être ajustée après la recette', () => {
    expect(TOLERANCE_CRENEAU_MS).toBe(30 * 60 * 1000);
  });
});
