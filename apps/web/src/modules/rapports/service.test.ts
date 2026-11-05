import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClassementsRecord } from '@/modules/chrono/domain';
import { DbUnavailableError } from '@/modules/iam/errors';
import type { SessionRecord } from '@/modules/iam/store';

import type { RapportRecord, RapportsStore } from './store';
import { genererCommande, genererRapportPostCourse, getEtatRapports } from './service';

// Story 7.4 — service rapports : composition des sections sur un record
// mocké (store injecté). Les rangs/temps viennent du calcul 7.1 repris TEL
// QUEL (versClassements réel, non mocké) : ex æquo 1,1 ; temps HH:MM:SS ;
// « — » pour une épreuve sans heure de départ. Édition vide : sections
// présentes, zéros lisibles. La commande ne porte QUE des validés.

const SESSION_ORGANISATEUR: SessionRecord = {
  accountId: 'account-pc',
  organisationId: 'org-1',
  email: 'pc@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const DEPART_LONGUE = new Date('2027-03-26T07:00:00.000Z');

const CLASSEMENTS_RECORD: ClassementsRecord = {
  edition: { id: 'edition-1', nom: 'Édition 2027' },
  epreuves: [
    {
      epreuveId: 'ep-longue',
      slug: 'longue',
      nom: 'La Longue — 35 km',
      distanceKm: 35,
      heureDepart: DEPART_LONGUE,
      lignes: [
        {
          dossard: 201,
          epreuveId: 'ep-longue',
          categorieAge: 'Senior',
          statut: 'arrivé',
          arriveeRecue: new Date('2027-03-26T08:01:01.000Z'),
        },
        {
          dossard: 202,
          epreuveId: 'ep-longue',
          categorieAge: 'V1',
          statut: 'arrivé',
          arriveeRecue: new Date('2027-03-26T08:01:01.000Z'),
        },
        {
          dossard: 203,
          epreuveId: 'ep-longue',
          categorieAge: 'Senior',
          statut: 'arrivé',
          arriveeRecue: new Date('2027-03-26T08:02:03.000Z'),
        },
        {
          dossard: 205,
          epreuveId: 'ep-longue',
          categorieAge: 'Senior',
          statut: 'en-course',
          arriveeRecue: null,
        },
        {
          dossard: 204,
          epreuveId: 'ep-longue',
          categorieAge: 'V2',
          statut: 'abandonné',
          arriveeRecue: null,
        },
      ],
    },
    {
      epreuveId: 'ep-sprint',
      slug: 'sprint',
      nom: 'Le Sprint — 5 km',
      distanceKm: 5,
      heureDepart: null,
      lignes: [
        {
          dossard: 241,
          epreuveId: 'ep-sprint',
          categorieAge: 'Senior',
          statut: 'arrivé',
          arriveeRecue: new Date('2027-03-26T08:03:00.000Z'),
        },
      ],
    },
  ],
  fraicheur: new Date('2027-03-26T08:03:00.000Z'),
};

const RECORD: RapportRecord = {
  edition: { id: 'edition-1', nom: 'Édition 2027', slug: '2027' },
  inscritsParStatut: [
    { statut: 'validé', total: 7 },
    { statut: 'en constitution', total: 2 },
    { statut: 'refusé', total: 1 },
  ],
  validesParTaille: [
    { epreuveNom: 'La Longue — 35 km', epreuveSlug: 'longue', taille: 'M', total: 2 },
    { epreuveNom: 'La Longue — 35 km', epreuveSlug: 'longue', taille: 'XL', total: 1 },
    { epreuveNom: 'Le Sprint — 5 km', epreuveSlug: 'sprint', taille: 'S', total: 1 },
  ],
  retraits: 6,
  checkpoints: [
    { titre: 'Scan km 12', secteurNom: 'Secteur course', passes: 3 },
    { titre: 'Scan arrivée stade', secteurNom: 'Secteur arrivée', passes: 4 },
  ],
  abandons: [
    {
      epreuveNom: 'La Longue — 35 km',
      dossard: 204,
      lieu: 'Col 1200',
      motif: 'epuisement',
      horodatage: new Date('2027-03-26T08:10:00.000Z'),
      auteurEmail: 'pc@exemple.dz',
    },
  ],
  visites: [
    { jour: '2027-03-26', visites: 12 },
    { jour: '2027-03-27', visites: 4 },
  ],
  classements: CLASSEMENTS_RECORD,
};

function magasin(record: RapportRecord): RapportsStore {
  return {
    lireRapport: vi.fn().mockResolvedValue(record),
    lireEdition: vi.fn().mockResolvedValue(null),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('genererRapportPostCourse', () => {
  it('fichier UNIQUE : en-tête « Généré le … — fraîcheur des données » puis sections titrées FR-26', async () => {
    const rapport = await genererRapportPostCourse(SESSION_ORGANISATEUR, {
      store: magasin(RECORD),
    });
    expect(rapport.nomFichier).toMatch(/^azzel-rapport-post-course-2027-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(rapport.contenu.startsWith('\uFEFF')).toBe(true);
    expect(rapport.contenu.includes('\r\n')).toBe(true);
    const lignes = rapport.contenu.split('\r\n');
    // En-tête daté (Africa/Algiers) + fraîcheur des données du même instant.
    expect(lignes[0]).toMatch(/^\uFEFFGénéré le \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/);
    expect(lignes[0]).toContain('fraîcheur des données :');
    const titres = lignes.filter(
      (ligne) => ligne.length > 0 && !ligne.includes(';') && !ligne.startsWith('\uFEFFGénéré le'),
    );
    expect(titres).toEqual([
      'Synthèse',
      'Passages par checkpoint',
      'Arrivées',
      'Abandons',
      'Portée des partages',
    ]);
  });

  it('synthèse : inscrits total + PAR STATUT, retraits, partants/arrivées/abandons par épreuve', async () => {
    const rapport = await genererRapportPostCourse(SESSION_ORGANISATEUR, {
      store: magasin(RECORD),
    });
    const lignes = rapport.contenu.split('\r\n');
    expect(lignes).toContain('Édition;Édition 2027');
    expect(lignes).toContain('Inscrits (total);10');
    expect(lignes).toContain('Inscrits — En constitution;2');
    expect(lignes).toContain('Inscrits — Validé;7');
    expect(lignes).toContain('Inscrits — Refusé;1');
    expect(lignes).toContain('Retraits (présents au départ);6');
    expect(lignes).toContain('Partants — La Longue — 35 km;5');
    expect(lignes).toContain('Arrivées — La Longue — 35 km;3');
    expect(lignes).toContain('Abandons — La Longue — 35 km;1');
    expect(lignes).toContain('Partants — Le Sprint — 5 km;1');
  });

  it('passages par checkpoint : titre, secteur, coureurs passés distincts', async () => {
    const rapport = await genererRapportPostCourse(SESSION_ORGANISATEUR, {
      store: magasin(RECORD),
    });
    const lignes = rapport.contenu.split('\r\n');
    expect(lignes).toContain('Checkpoint;Secteur;Coureurs passés');
    expect(lignes).toContain('Scan km 12;Secteur course;3');
    expect(lignes).toContain('Scan arrivée stade;Secteur arrivée;4');
  });

  it('arrivées : rangs/temps repris du calcul 7.1 TEL QUEL (ex æquo 1,1 puis 3 ; « — » sans heure de départ)', async () => {
    const rapport = await genererRapportPostCourse(SESSION_ORGANISATEUR, {
      store: magasin(RECORD),
    });
    const lignes = rapport.contenu.split('\r\n');
    expect(lignes).toContain('Épreuve;Dossard;Rang;Temps');
    // 201 et 202 arrivent ensemble → même temps, ex æquo 1, 1 ; 203 → 3.
    expect(lignes).toContain('La Longue — 35 km;201;1;01:01:01');
    expect(lignes).toContain('La Longue — 35 km;202;1;01:01:01');
    expect(lignes).toContain('La Longue — 35 km;203;3;01:02:03');
    // Sprint sans heure de départ : arrivé SANS rang ni temps, jamais un
    // temps faux à zéro.
    expect(lignes).toContain('Le Sprint — 5 km;241;—;—');
  });

  it('abandons détaillés 5.3 : épreuve, dossard, lieu, motif, heure, auteur organisateur', async () => {
    const rapport = await genererRapportPostCourse(SESSION_ORGANISATEUR, {
      store: magasin(RECORD),
    });
    const lignes = rapport.contenu.split('\r\n');
    expect(lignes).toContain('Épreuve;Dossard;Lieu;Motif;Heure;Auteur');
    const abandon = lignes.find((ligne) => ligne.startsWith('La Longue — 35 km;204;'));
    expect(abandon).toBeDefined();
    expect(abandon).toContain('Col 1200');
    expect(abandon).toContain('Épuisement');
    expect(abandon).toContain('pc@exemple.dz');
    expect(abandon).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('portée des partages 7.2 : une ligne par jour + total', async () => {
    const rapport = await genererRapportPostCourse(SESSION_ORGANISATEUR, {
      store: magasin(RECORD),
    });
    const lignes = rapport.contenu.split('\r\n');
    expect(lignes).toContain('Jour;Visites');
    expect(lignes).toContain('2027-03-26;12');
    expect(lignes).toContain('2027-03-27;4');
    expect(lignes).toContain('Total;16');
  });

  it('anonymat : aucun nom/prénom/téléphone de coureur ne transite par le CSV', async () => {
    const rapport = await genererRapportPostCourse(SESSION_ORGANISATEUR, {
      store: magasin(RECORD),
    });
    expect(rapport.contenu).not.toContain('Prenom');
    expect(rapport.contenu).not.toContain('+213');
  });

  it('édition vide : en-tête honnête, sections présentes, zéros lisibles, aucun crash', async () => {
    const vide: RapportRecord = {
      edition: null,
      inscritsParStatut: [],
      validesParTaille: [],
      retraits: 0,
      checkpoints: [],
      abandons: [],
      visites: [],
      classements: { edition: null, epreuves: [], fraicheur: null },
    };
    const rapport = await genererRapportPostCourse(SESSION_ORGANISATEUR, {
      store: magasin(vide),
    });
    expect(rapport.nomFichier).toMatch(/^azzel-rapport-post-course-aucune-edition-\d{4}-\d{2}-\d{2}\.csv$/);
    const lignes = rapport.contenu.split('\r\n');
    // Sans fraîcheur : l'en-tête le dit, jamais une date inventée.
    expect(lignes[0]).toContain('fraîcheur des données : aucune donnée reçue');
    for (const titre of [
      'Synthèse',
      'Passages par checkpoint',
      'Arrivées',
      'Abandons',
      'Portée des partages',
    ]) {
      expect(lignes).toContain(titre);
    }
    expect(lignes).toContain('Édition;—');
    expect(lignes).toContain('Inscrits (total);0');
    expect(lignes).toContain('Inscrits — En constitution;0');
    expect(lignes).toContain('Retraits (présents au départ);0');
    // Aucune ligne fantôme sous les en-têtes de sections vides.
    expect(lignes).toContain('Checkpoint;Secteur;Coureurs passés');
    expect(lignes).toContain('Épreuve;Dossard;Rang;Temps');
    expect(lignes).toContain('Total;0');
  });

  it('base indisponible : DbUnavailableError remonte (la route la mappera en 503 douce)', async () => {
    const store: RapportsStore = {
      lireRapport: vi.fn().mockRejectedValue(new DbUnavailableError()),
      lireEdition: vi.fn(),
    };
    await expect(
      genererRapportPostCourse(SESSION_ORGANISATEUR, { store }),
    ).rejects.toBeInstanceOf(DbUnavailableError);
  });
});

describe('genererCommande', () => {
  it('en-tête daté + validés par épreuve × taille (jointure par slug) + totaux + médailles + zéro stock', async () => {
    const commande = await genererCommande(SESSION_ORGANISATEUR, {
      store: magasin(RECORD),
    });
    expect(commande.nomFichier).toMatch(/^azzel-commande-2027-\d{4}-\d{2}-\d{2}\.csv$/);
    const lignes = commande.contenu.split('\r\n');
    expect(lignes[0]).toMatch(/^\uFEFFGénéré le \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/);
    expect(lignes).toContain(
      'Commande t-shirts par épreuve et taille (validés)',
    );
    expect(lignes).toContain('Épreuve;XS;S;M;L;XL;XXL;Total');
    expect(lignes).toContain('La Longue — 35 km;0;0;2;0;1;0;3');
    expect(lignes).toContain('Le Sprint — 5 km;0;1;0;0;0;0;1');
    expect(lignes).toContain('Toutes épreuves;0;1;2;0;1;0;4');
    expect(lignes).toContain('Médailles par épreuve');
    expect(lignes).toContain('La Longue — 35 km;3');
    expect(lignes).toContain('Le Sprint — 5 km;1');
    expect(lignes).toContain('Total;4');
    expect(commande.contenu).toContain('Zéro stock : commandé = validé');
  });

  it('la commande ne parle JAMAIS des statuts non validés', async () => {
    const commande = await genererCommande(SESSION_ORGANISATEUR, {
      store: magasin(RECORD),
    });
    expect(commande.contenu).not.toContain('En constitution');
    expect(commande.contenu).not.toContain('Refusé');
  });

  it('édition sans validé : zéros lisibles, aucune ligne fantôme', async () => {
    const vide: RapportRecord = {
      ...RECORD,
      validesParTaille: [],
    };
    const commande = await genererCommande(SESSION_ORGANISATEUR, {
      store: magasin(vide),
    });
    const lignes = commande.contenu.split('\r\n');
    expect(lignes).toContain('La Longue — 35 km;0;0;0;0;0;0;0');
    expect(lignes).toContain('Toutes épreuves;0;0;0;0;0;0;0');
    expect(lignes).toContain('Total;0');
  });
});

describe('getEtatRapports — édition courante pour la note J-10 de la page', () => {
  it('rend l’édition (nom, slug, date de course ISO) sans payer le rapport complet', async () => {
    const store: RapportsStore = {
      lireRapport: vi.fn(),
      lireEdition: vi
        .fn()
        .mockResolvedValue({ id: 'edition-1', nom: 'Édition 2027', slug: '2027', raceDate: new Date('2027-03-26T00:00:00.000Z') }),
    };
    const etat = await getEtatRapports(SESSION_ORGANISATEUR, { store });
    expect(etat).toEqual({
      edition: { nom: 'Édition 2027', slug: '2027', raceDate: '2027-03-26T00:00:00.000Z' },
    });
    expect(store.lireRapport).not.toHaveBeenCalled();
  });

  it('sans édition : null (note générique côté page, jamais une erreur)', async () => {
    const store: RapportsStore = {
      lireRapport: vi.fn(),
      lireEdition: vi.fn().mockResolvedValue(null),
    };
    expect(await getEtatRapports(SESSION_ORGANISATEUR, { store })).toEqual({ edition: null });
  });
});
