import { describe, expect, it } from 'vitest';

import type { EtatVolontaires } from '@/lib/idb-volontaires';
import type { MissionVolontaireView } from '@/modules/missions/service';

import { repliPoche } from './repli-poche';

// Story 4.7 — réseau présent et base muette : le serveur répond, le service
// worker laisse passer, et la carte « Connexion indisponible » prend la place
// du scanner alors que l'annuaire, la boîte d'envoi et le jeton d'appareil
// dorment en IndexedDB. Le client relit l'affectation dans la poche avec la
// résolution de 4.6 — la MÊME, repli et blocages compris.

function mission(
  id: string,
  type: 'scan_checkpoint' | 'distribution_dossards' | 'accueil',
  debutHeure: number,
  finHeure: number,
): MissionVolontaireView {
  return {
    id,
    secteurNom: 'Km 12',
    secteurLieu: 'Zone blanche',
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

const REPRISE_DE = '2027-05-16T04:12:00.000Z';

function poche(mesMissions: MissionVolontaireView[]): EtatVolontaires {
  return {
    accountId: 'account-karim',
    editionNom: 'Édition 2027',
    assistancePhone: '+213 555 010 200',
    mesMissions,
    missions: mesMissions,
    generéA: REPRISE_DE,
  };
}

function a(heure: number, minute = 0): Date {
  return new Date(2027, 4, 16, heure, minute, 0);
}

describe('repliPoche — la poche fournit l’affectation quand le serveur se tait', () => {
  it('mission scan en poche : résolue, avec la date de l’état repris', () => {
    const resultat = repliPoche(poche([mission('cp1', 'scan_checkpoint', 9, 12)]), 'chrono', a(10));
    expect(resultat).toEqual({
      statut: 'resolue',
      mission: expect.objectContaining({ id: 'cp1', titre: 'Mission cp1' }),
      repriseDe: REPRISE_DE,
    });
  });

  it('mission guichet en poche : le mode retrait part aussi', () => {
    const resultat = repliPoche(
      poche([mission('g1', 'distribution_dossards', 5, 11)]),
      'retrait',
      a(9),
    );
    expect(resultat.statut).toBe('resolue');
  });

  it('poche vide (jamais ouverte en ligne) : absente, jamais de scan à l’aveugle', () => {
    expect(repliPoche(null, 'chrono', a(10))).toEqual({ statut: 'absente' });
  });

  it('poche garnie mais aucune mission de la famille : absente', () => {
    expect(repliPoche(poche([mission('acc', 'accueil', 9, 12)]), 'chrono', a(10))).toEqual({
      statut: 'absente',
    });
    expect(
      repliPoche(poche([mission('cp1', 'scan_checkpoint', 9, 12)]), 'retrait', a(10)),
    ).toEqual({ statut: 'absente' });
  });
});

describe('repliPoche — les blocages de 4.6 s’appliquent à l’identique', () => {
  const deux = [
    mission('cp1', 'scan_checkpoint', 9, 12),
    mission('cp4', 'scan_checkpoint', 14, 18),
  ];

  it('creux : bloqué hors créneau, les missions nommées', () => {
    const resultat = repliPoche(poche(deux), 'chrono', a(13));
    expect(resultat.statut).toBe('bloquee');
    expect(resultat.statut === 'bloquee' && resultat.raison).toBe('hors-creneau');
    expect(
      resultat.statut === 'bloquee' && resultat.missions.map((m) => m.id),
    ).toEqual(['cp1', 'cp4']);
  });

  it('chevauchement : bloqué, jamais un checkpoint choisi par ordre de liste', () => {
    const chevauchantes = [
      mission('cp1', 'scan_checkpoint', 9, 12),
      mission('cp4', 'scan_checkpoint', 11, 14),
    ];
    const resultat = repliPoche(poche(chevauchantes), 'chrono', a(11, 30));
    expect(resultat.statut === 'bloquee' && resultat.raison).toBe('chevauchement');
  });

  it('débordement toléré : la poche le respecte comme le serveur', () => {
    expect(repliPoche(poche(deux), 'chrono', a(12, 20)).statut).toBe('resolue');
  });

  it('mission unique hors créneau : résolue — non-régression, comme le serveur', () => {
    const seule = poche([mission('cp1', 'scan_checkpoint', 9, 12)]);
    expect(repliPoche(seule, 'chrono', a(20)).statut).toBe('resolue');
  });
});

describe('repliPoche — jamais plus strict que le serveur (AC9 de 4.7)', () => {
  // Le contrat de la story : la poche accepte exactement ce que le serveur
  // accepte. Si ces deux chemins divergeaient, le scanner serait plus
  // restrictif hors-ligne qu'en ligne, pour la même question.
  const cas: { nom: string; missions: MissionVolontaireView[]; instant: Date }[] = [
    { nom: 'unique en fenêtre', missions: [mission('cp1', 'scan_checkpoint', 9, 12)], instant: a(10) },
    { nom: 'unique hors fenêtre', missions: [mission('cp1', 'scan_checkpoint', 9, 12)], instant: a(20) },
    {
      nom: 'deux, une en fenêtre',
      missions: [mission('cp1', 'scan_checkpoint', 9, 12), mission('cp4', 'scan_checkpoint', 14, 18)],
      instant: a(15),
    },
    {
      nom: 'deux, creux',
      missions: [mission('cp1', 'scan_checkpoint', 9, 12), mission('cp4', 'scan_checkpoint', 14, 18)],
      instant: a(13),
    },
    {
      nom: 'deux, chevauchantes',
      missions: [mission('cp1', 'scan_checkpoint', 9, 12), mission('cp4', 'scan_checkpoint', 11, 14)],
      instant: a(11, 30),
    },
  ];

  it.each(cas)('$nom : même verdict que resoudreMissionScan', async ({ missions, instant }) => {
    const { resoudreMissionScan } = await import('./mission-scan');
    const serveur = resoudreMissionScan(missions, instant);
    const client = repliPoche(poche(missions), 'chrono', instant);

    if (serveur === null) {
      expect(client.statut).toBe('absente');
      return;
    }
    if (serveur.ok) {
      expect(client.statut === 'resolue' && client.mission.id).toBe(serveur.mission.id);
      return;
    }
    expect(client.statut === 'bloquee' && client.raison).toBe(serveur.raison);
  });
});
