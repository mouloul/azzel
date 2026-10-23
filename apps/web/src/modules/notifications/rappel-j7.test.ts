import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DossierListItem, InscriptionsStore } from '@/modules/inscriptions/store';

import type { OutboxStore } from './outbox-store';
import { dateAujourdhui, estDansFenetreJ7, planifierRappelsJ7 } from './rappel-j7';

// Story 6.4 — fenêtre J-7 et planification : décisions pures + boucle par
// organisation avec stores stubbés (l'intégration réelle — index unique
// partiel, worker, Mailpit — vit dans outbox.integration.test.ts).

describe('estDansFenetreJ7 — J-7 ≤ aujourd’hui < jour de course', () => {
  const DATE_COURSE = '2027-03-26';

  it('avant J-7 : faux (aucun enfilement anticipé)', () => {
    expect(estDansFenetreJ7('2027-03-18', DATE_COURSE)).toBe(false); // J-8
  });

  it('pile J-7 : vrai', () => {
    expect(estDansFenetreJ7('2027-03-19', DATE_COURSE)).toBe(true);
  });

  it('rattrapage (cron raté J-7, relancé J-5/J-1) : vrai', () => {
    expect(estDansFenetreJ7('2027-03-21', DATE_COURSE)).toBe(true); // J-5
    expect(estDansFenetreJ7('2027-03-25', DATE_COURSE)).toBe(true); // J-1
  });

  it('jour de course et après : faux (aucun enfilement)', () => {
    expect(estDansFenetreJ7(DATE_COURSE, DATE_COURSE)).toBe(false);
    expect(estDansFenetreJ7('2027-03-27', DATE_COURSE)).toBe(false);
  });

  it('dates invalides : jamais dans la fenêtre (aucun enfilement sur donnée sale)', () => {
    expect(estDansFenetreJ7('pas-une-date', DATE_COURSE)).toBe(false);
    expect(estDansFenetreJ7('2027-03-21', '')).toBe(false);
    expect(estDansFenetreJ7('', '')).toBe(false);
  });

  // Story 6.4 (revue) — aller-retour : les dates INEXISTANTES sont rejetées
  // (Date.UTC les ferait glisser silencieusement au mois suivant).
  it('dates inexistantes rejetées par l’aller-retour, bissextiles exactes acceptées', () => {
    expect(estDansFenetreJ7('2027-02-28', '2027-03-07')).toBe(true); // J-7 pile, 2027 non bissextile
    expect(estDansFenetreJ7('2027-02-29', '2027-03-07')).toBe(false); // 29 février inexistant en 2027
    expect(estDansFenetreJ7('2027-02-31', '2027-03-07')).toBe(false); // 31 février inexistant
    expect(estDansFenetreJ7('2028-02-29', '2028-03-07')).toBe(true); // 2028 bissextile
  });
});

describe('dateAujourdhui — date civile en fuseau Africa/Algiers', () => {
  it('format YYYY-MM-DD strict, cohérente avec l’instant présent (±1 jour du jour UTC)', () => {
    const ajd = dateAujourdhui();
    expect(ajd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [annee = 0, mois = 1, jour = 1] = ajd.split('-').map(Number);
    expect(annee).toBeGreaterThan(2020);
    expect(mois).toBeGreaterThanOrEqual(1);
    expect(mois).toBeLessThanOrEqual(12);
    expect(jour).toBeGreaterThanOrEqual(1);
    expect(jour).toBeLessThanOrEqual(31);
    // L’Algérie est à UTC+1 : la date civile algérienne ne peut différer du
    // jour UTC que de ±1 jour, jamais plus.
    const ecartMs = Math.abs(
      Date.UTC(annee, mois - 1, jour) - Date.parse(new Date().toISOString()),
    );
    expect(ecartMs).toBeLessThanOrEqual(2 * 86_400_000);
  });
});

interface CoureurStub {
  coureurId: string;
  prenom: string;
  email: string;
  status: string;
}

function coureur(overrides: Partial<CoureurStub> = {}): CoureurStub {
  return {
    coureurId: 'coureur-1',
    prenom: 'Yani',
    email: 'yani@exemple.dz',
    status: 'validé',
    ...overrides,
  };
}

function depotsJ7(coureurs: CoureurStub[]) {
  const inscriptions = {
    findCurrentEdition: vi.fn(async () => ({
      id: 'edition-1',
      organisationId: 'org-1',
      slug: '2027',
      nom: 'Édition 2027',
      dateCourse: '2027-03-26',
      registrationClosesAt: new Date('2027-02-01T00:00:00.000Z'),
    })),
    listCoureurs: vi.fn(async () => ({
      items: coureurs as DossierListItem[],
      hasMore: false,
    })),
  } as unknown as Pick<InscriptionsStore, 'findCurrentEdition' | 'listCoureurs'> & {
    findCurrentEdition: ReturnType<typeof vi.fn>;
    listCoureurs: ReturnType<typeof vi.fn>;
  };
  const dejaEnfiles = new Set<string>();
  const outbox = {
    listOrganisationIds: vi.fn(async () => ['org-1']),
    insertRappelJ7: vi.fn(async (_organisationId: string, input: { destinataire: string }) => {
      if (dejaEnfiles.has(input.destinataire)) {
        return false;
      }
      dejaEnfiles.add(input.destinataire);
      return true;
    }),
  } as unknown as Pick<OutboxStore, 'listOrganisationIds' | 'insertRappelJ7'> & {
    listOrganisationIds: ReturnType<typeof vi.fn>;
    insertRappelJ7: ReturnType<typeof vi.fn>;
  };
  return { inscriptions, outbox, dejaEnfiles };
}

describe('planifierRappelsJ7 — enfilement par organisation (stores stubbés)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dans la fenêtre : un email par coureur VALIDÉ uniquement, payload {prenom, dateCourse}', async () => {
    const { inscriptions, outbox } = depotsJ7([
      coureur(),
      coureur({ coureurId: 'c2', prenom: 'Iness', email: 'iness@exemple.dz', status: 'en constitution' }),
      coureur({ coureurId: 'c3', prenom: 'Lounis', email: 'lounis@exemple.dz', status: 'refusé' }),
      coureur({ coureurId: 'c4', prenom: 'Kahina', email: 'kahina@exemple.dz' }),
    ]);
    const resume = await planifierRappelsJ7(
      { outbox, inscriptions },
      '2027-03-19',
    );
    expect(resume).toEqual({
      organisations: 1,
      organisationsDansFenetre: 1,
      enfiles: 2,
      dejaEnfiles: 0,
      horsFenetre: 0,
      erreur: null,
    });
    expect(outbox.insertRappelJ7).toHaveBeenCalledTimes(2);
    expect(outbox.insertRappelJ7).toHaveBeenCalledWith('org-1', {
      destinataire: 'yani@exemple.dz',
      payload: { prenom: 'Yani', dateCourse: '2027-03-26' },
    });
    expect(outbox.insertRappelJ7).toHaveBeenCalledWith('org-1', {
      destinataire: 'kahina@exemple.dz',
      payload: { prenom: 'Kahina', dateCourse: '2027-03-26' },
    });
  });

  it('rejeu même jour (insert résorbé) : dejaEnfiles compté, aucun doublon', async () => {
    const { inscriptions, outbox } = depotsJ7([coureur()]);
    const premier = await planifierRappelsJ7(
      { outbox, inscriptions },
      '2027-03-19',
    );
    expect(premier.enfiles).toBe(1);
    const rejeu = await planifierRappelsJ7(
      { outbox, inscriptions },
      '2027-03-19',
    );
    expect(rejeu.enfiles).toBe(0);
    expect(rejeu.dejaEnfiles).toBe(1);
  });

  it('rattrapage J-5 : les non-notifiés reçoivent le rappel (fenêtre ≥ J-7)', async () => {
    const { inscriptions, outbox } = depotsJ7([coureur()]);
    const resume = await planifierRappelsJ7(
      { outbox, inscriptions },
      '2027-03-21',
    );
    expect(resume.organisationsDansFenetre).toBe(1);
    expect(resume.enfiles).toBe(1);
  });

  it('jour de course / après : AUCUN enfilement, organisation comptée hors fenêtre', async () => {
    const { inscriptions, outbox } = depotsJ7([coureur()]);
    for (const aujourdhui of ['2027-03-26', '2027-03-27']) {
      const resume = await planifierRappelsJ7(
        { outbox, inscriptions },
        aujourdhui,
      );
      expect(resume, aujourdhui).toEqual({
        organisations: 1,
        organisationsDansFenetre: 0,
        enfiles: 0,
        dejaEnfiles: 0,
        horsFenetre: 1,
        erreur: null,
      });
    }
    expect(outbox.insertRappelJ7).not.toHaveBeenCalled();
  });

  it('avant J-7 : aucun enfilement', async () => {
    const { inscriptions, outbox } = depotsJ7([coureur()]);
    const resume = await planifierRappelsJ7(
      { outbox, inscriptions },
      '2027-03-18',
    );
    expect(resume.enfiles).toBe(0);
    expect(resume.horsFenetre).toBe(1);
    expect(outbox.insertRappelJ7).not.toHaveBeenCalled();
  });

  it('coureur validé sans email : sauté sans crash, les autres partent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { inscriptions, outbox } = depotsJ7([
        coureur({ email: '' }),
        coureur({ coureurId: 'c2', prenom: 'Kahina', email: 'kahina@exemple.dz' }),
      ]);
      const resume = await planifierRappelsJ7(
        { outbox, inscriptions },
        '2027-03-19',
      );
      expect(resume.enfiles).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('une organisation malade n’arrête pas la boucle : erreur accumulée, résolu ailleurs', async () => {
    const { inscriptions, outbox } = depotsJ7([coureur()]);
    outbox.listOrganisationIds.mockResolvedValue(['org-1', 'org-malade']);
    inscriptions.findCurrentEdition.mockImplementation(
      async (organisationId: string) => {
        if (organisationId === 'org-malade') {
          throw new Error('org malade injoignable');
        }
        return {
          id: 'edition-1',
          organisationId,
          slug: '2027',
          nom: 'Édition 2027',
          dateCourse: '2027-03-26',
          registrationClosesAt: new Date('2027-02-01T00:00:00.000Z'),
        };
      },
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const resume = await planifierRappelsJ7(
        { outbox, inscriptions },
        '2027-03-19',
      );
      expect(resume.enfiles).toBe(1);
      expect(resume.erreur).toContain('org-malade');
    } finally {
      error.mockRestore();
    }
  });

  it('lecture des organisations impossible : résumé vide avec erreur, aucune exception', async () => {
    const { inscriptions, outbox } = depotsJ7([]);
    outbox.listOrganisationIds.mockRejectedValue(new Error('database unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const resume = await planifierRappelsJ7(
        { outbox, inscriptions },
        '2027-03-19',
      );
      expect(resume).toEqual({
        organisations: 0,
        organisationsDansFenetre: 0,
        enfiles: 0,
        dejaEnfiles: 0,
        horsFenetre: 0,
        erreur: 'database unavailable',
      });
    } finally {
      error.mockRestore();
    }
  });

  it('aucune édition courante : organisation ignorée sans erreur', async () => {
    const { inscriptions, outbox } = depotsJ7([coureur()]);
    inscriptions.findCurrentEdition.mockResolvedValue(null);
    const resume = await planifierRappelsJ7(
      { outbox, inscriptions },
      '2027-03-19',
    );
    expect(resume).toEqual({
      organisations: 1,
      organisationsDansFenetre: 0,
      enfiles: 0,
      dejaEnfiles: 0,
      horsFenetre: 0,
      erreur: null,
    });
  });

  // Story 6.4 (revue) — pagination : au-delà d'une page, les validés des
  // pages suivantes reçoivent eux aussi le rappel (offset passé au store).
  it('pagination : pages suivantes parcourues tant que hasMore, offset avancé', async () => {
    const tous = [
      coureur({ coureurId: 'p1', email: 'p1@exemple.dz' }),
      coureur({ coureurId: 'p2', email: 'p2@exemple.dz', status: 'en constitution' }),
      coureur({ coureurId: 'p3', email: 'p3@exemple.dz' }),
      coureur({ coureurId: 'p4', email: 'p4@exemple.dz' }),
    ];
    const inscriptions = {
      findCurrentEdition: vi.fn(async () => ({
        id: 'edition-1',
        organisationId: 'org-1',
        slug: '2027',
        nom: 'Édition 2027',
        dateCourse: '2027-03-26',
        registrationClosesAt: new Date('2027-02-01T00:00:00.000Z'),
      })),
      listCoureurs: vi.fn(async (input: { offset?: number }) => {
        const offset = input.offset ?? 0;
        return {
          items: tous.slice(offset, offset + 2) as DossierListItem[],
          hasMore: offset + 2 < tous.length,
        };
      }),
    } as unknown as Pick<InscriptionsStore, 'findCurrentEdition' | 'listCoureurs'> & {
      findCurrentEdition: ReturnType<typeof vi.fn>;
      listCoureurs: ReturnType<typeof vi.fn>;
    };
    const outbox = {
      listOrganisationIds: vi.fn(async () => ['org-1']),
      insertRappelJ7: vi.fn(async () => true),
    } as unknown as Pick<OutboxStore, 'listOrganisationIds' | 'insertRappelJ7'> & {
      listOrganisationIds: ReturnType<typeof vi.fn>;
      insertRappelJ7: ReturnType<typeof vi.fn>;
    };
    const resume = await planifierRappelsJ7({ outbox, inscriptions }, '2027-03-19');
    // p2 (non validé) exclu ; p1/p3/p4 couverts, y compris p4 sur la 2ᵉ page.
    expect(resume.enfiles).toBe(3);
    expect(inscriptions.listCoureurs).toHaveBeenCalledTimes(2);
    expect(inscriptions.listCoureurs).toHaveBeenCalledWith({
      organisationId: 'org-1',
      editionId: 'edition-1',
      offset: 0,
    });
    expect(inscriptions.listCoureurs).toHaveBeenCalledWith({
      organisationId: 'org-1',
      editionId: 'edition-1',
      offset: 2,
    });
    expect(outbox.insertRappelJ7).toHaveBeenCalledWith('org-1', {
      destinataire: 'p4@exemple.dz',
      payload: { prenom: 'Yani', dateCourse: '2027-03-26' },
    });
  });

  it('garde anti-boucle : page vide avec hasMore vrai → arrêt immédiat', async () => {
    const inscriptions = {
      findCurrentEdition: vi.fn(async () => ({
        id: 'edition-1',
        organisationId: 'org-1',
        slug: '2027',
        nom: 'Édition 2027',
        dateCourse: '2027-03-26',
        registrationClosesAt: new Date('2027-02-01T00:00:00.000Z'),
      })),
      // Store incohérent : hasMore toujours vrai mais page vide — le cron
      // doit terminer (l'offset n'avance pas sur une page vide).
      listCoureurs: vi.fn(async () => ({ items: [] as DossierListItem[], hasMore: true })),
    } as unknown as Pick<InscriptionsStore, 'findCurrentEdition' | 'listCoureurs'> & {
      listCoureurs: ReturnType<typeof vi.fn>;
    };
    const outbox = {
      listOrganisationIds: vi.fn(async () => ['org-1']),
      insertRappelJ7: vi.fn(async () => true),
    } as unknown as Pick<OutboxStore, 'listOrganisationIds' | 'insertRappelJ7'>;
    const resume = await planifierRappelsJ7({ outbox, inscriptions }, '2027-03-19');
    expect(resume.enfiles).toBe(0);
    expect(inscriptions.listCoureurs).toHaveBeenCalledTimes(1);
  });
});
