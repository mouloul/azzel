import { describe, expect, it, vi } from 'vitest';

import {
  type CoureurAnnuaire,
  type PassageTerrain,
  type RetraitTerrain,
} from '@azzel/shared';

import { cleIndexPassage } from '@/lib/idb-volontaires';

import {
  NOTE_NON_ENREGISTRE,
  creerEvenementPassage,
  creerEvenementRetrait,
  formatHeureVoyant,
  libelleVoyantPassage,
  libelleVoyantRetrait,
  resoudrePassage,
  resoudreRetrait,
  traiterScanPassage,
  traiterScanRetrait,
  type PassagesExistants,
  type RetraitsExistants,
} from './etats-scan';

// Story 4.2 — les fonctions de dédoublonnage de SESSION ont été retirées avec
// l'arrivée des modes persistants (4.3 retrait, 4.4 passage) ; seul
// formatHeureVoyant (états/partagé) subsiste du socle 4.2.
// Story 4.3 — matrice retrait : dédoublonnage PERSISTANT (index outbox passé
// en paramètre, cross-session), libellés dédiés, événement retourné SANS
// mutation cachée.
// Story 4.4 — matrice passage : dédoublonnage par PAIRE coureur × checkpoint
// (même coureur à un autre checkpoint = NOUVEAU succès), libellés exacts
// FR-13 (heure appareil DANS le libellé succès), clé composite portée par le
// doublon et le refus d'append (rattachement de la note au voyant).

function coureur(dossard: number, prenom: string, jeton: string): CoureurAnnuaire {
  return { dossard, nom: `Nom${dossard}`, prenom, jeton };
}

const JETON_74 = 'AbCdEfGhIjKlMnOpQrStUv';
const JETON_12 = 'ZyXwVuTsRqPoNmLkJiHgFe';

const INDEX = new Map<string, CoureurAnnuaire>([
  [JETON_74, coureur(74, 'Yani', JETON_74)],
  [JETON_12, coureur(12, 'Iness', JETON_12)],
]);

describe('formatHeureVoyant — heure locale mono de l’appareil', () => {
  it('HH:MM:SS à deux chiffres, heure locale (pas d’UTC forcé)', () => {
    const date = new Date(2027, 4, 16, 7, 5, 9);
    expect(formatHeureVoyant(date)).toBe('07:05:09');
  });

  it('padStart sur chaque composant', () => {
    expect(formatHeureVoyant(new Date(2027, 4, 16, 23, 0, 1))).toBe('23:00:01');
  });
});

// ---------------------------------------------------------------------------
// Story 4.3 — mode retrait : résolution + événement + libellés dédiés.
// ---------------------------------------------------------------------------

const RETRAITS_VIDES: RetraitsExistants = new Map();

describe('resoudreRetrait — matrice guichet', () => {
  it('payload e1 connu, jamais retiré : succès avec coureur et dossard', () => {
    const resultat = resoudreRetrait(`azzel-e1:${JETON_74}`, INDEX, RETRAITS_VIDES);
    expect(resultat.etat).toBe('succès');
    expect(resultat.dossard).toBe(74);
    expect(resultat.coureur?.prenom).toBe('Yani');
    expect(resultat.premierRetireA).toBeUndefined();
  });

  it('retrait déjà en outbox (session suivante incluse) : doublon, heure du PREMIER retrait', () => {
    // Index tel que reconstruit de l'outbox au démarrage — « toutes sessions
    // confondues » : le volontaire s'est déconnecté/reconnecté entre-temps.
    const premierRetireA = new Date('2027-05-16T06:12:30');
    const retraitsExistants: RetraitsExistants = new Map([[JETON_74, premierRetireA]]);
    const resultat = resoudreRetrait(`azzel-e1:${JETON_74}`, INDEX, retraitsExistants);
    expect(resultat.etat).toBe('doublon');
    expect(resultat.dossard).toBe(74);
    expect((resultat.premierRetireA as Date).getTime()).toBe(premierRetireA.getTime());
  });

  it('payload invalide ou jeton absent de l’annuaire : inconnu (identique 4.2)', () => {
    expect(resoudreRetrait('74', INDEX, RETRAITS_VIDES).etat).toBe('inconnu');
    expect(resoudreRetrait('azzel-e2:quoi', INDEX, RETRAITS_VIDES).etat).toBe('inconnu');
    expect(
      resoudreRetrait('azzel-e1:QqRrSsTtUuVvWwXxYyZz12', INDEX, RETRAITS_VIDES).etat,
    ).toBe('inconnu');
  });

  it('pur : la résolution ne modifie JAMAIS l’index des retraits existants', () => {
    const index = new Map<string, Date>();
    resoudreRetrait(`azzel-e1:${JETON_74}`, INDEX, index);
    expect(index.size).toBe(0);
  });

  it('un autre coureur retiré ne dédoublonne JAMAIS ce coureur', () => {
    const retraitsExistants: RetraitsExistants = new Map([[JETON_12, new Date()]]);
    expect(resoudreRetrait(`azzel-e1:${JETON_74}`, INDEX, retraitsExistants).etat).toBe('succès');
  });
});

describe('creerEvenementRetrait — l’événement à appendre, sans mutation cachée', () => {
  const SUCCES = resoudreRetrait(`azzel-e1:${JETON_74}`, INDEX, RETRAITS_VIDES);
  const HORODATAGE = new Date('2027-05-16T06:12:30');

  it('succès : événement minimal (NFR-7) — jeton opaque, JAMAIS de nom en clair', () => {
    const evenement = creerEvenementRetrait(SUCCES, 'appareil-1', 'edition-1', HORODATAGE);
    expect(evenement).toEqual({
      version: 1,
      type: 'retrait',
      editionId: 'edition-1',
      jeton: JETON_74,
      horodatage: HORODATAGE.toISOString(),
      appareilId: 'appareil-1',
    } satisfies RetraitTerrain);
    expect(JSON.stringify(evenement)).not.toContain('Yani');
    expect(JSON.stringify(evenement)).not.toContain('Ulmani');
  });

  it('doublon et inconnu : null — rien à appendre', () => {
    const doublon = resoudreRetrait(
      `azzel-e1:${JETON_74}`,
      INDEX,
      new Map([[JETON_74, HORODATAGE]]),
    );
    expect(creerEvenementRetrait(doublon, 'appareil-1', 'edition-1', HORODATAGE)).toBeNull();
    const inconnu = resoudreRetrait('nimporte', INDEX, RETRAITS_VIDES);
    expect(creerEvenementRetrait(inconnu, 'appareil-1', 'edition-1', HORODATAGE)).toBeNull();
  });

  it('identifiants vides : null (défense — jamais d’événement hors contrat)', () => {
    expect(creerEvenementRetrait(SUCCES, '', 'edition-1', HORODATAGE)).toBeNull();
    expect(creerEvenementRetrait(SUCCES, 'appareil-1', '', HORODATAGE)).toBeNull();
  });
});

describe('libelleVoyantRetrait — libellés dédiés du guichet', () => {
  it('succès : « ✓ Dossard N — {prénom} · présent au départ »', () => {
    const resultat = resoudreRetrait(`azzel-e1:${JETON_74}`, INDEX, RETRAITS_VIDES);
    expect(libelleVoyantRetrait(resultat)).toBe('✓ Dossard 74 — Yani · présent au départ');
  });

  it('doublon : « ↻ DÉJÀ PASSÉ — retiré à HH:MM:SS » avec l’heure du PREMIER retrait', () => {
    const resultat = resoudreRetrait(
      `azzel-e1:${JETON_74}`,
      INDEX,
      new Map([[JETON_74, new Date('2027-05-16T06:12:30')]]),
    );
    expect(libelleVoyantRetrait(resultat)).toBe('↻ DÉJÀ PASSÉ — retiré à 06:12:30');
  });

  it('doublon sans premierRetireA (donnée incohérente) : texte SANS heure, pas d’horaire bidon', () => {
    expect(libelleVoyantRetrait({ etat: 'doublon', dossard: 74 })).toBe('↻ DÉJÀ PASSÉ');
  });

  it('inconnu : « ⚠ DOSSARD INCONNU — revérifier » (identique 4.2)', () => {
    expect(libelleVoyantRetrait({ etat: 'inconnu' })).toBe('⚠ DOSSARD INCONNU — revérifier');
  });

  it('succès sans coureur/dossard (donnée incohérente) : texte dégradé, jamais « undefined »', () => {
    expect(libelleVoyantRetrait({ etat: 'succès' })).toBe('✓ présent au départ');
    expect(libelleVoyantRetrait({ etat: 'succès', dossard: 74 })).toBe('✓ présent au départ');
    expect(libelleVoyantRetrait({ etat: 'succès' })).not.toContain('undefined');
  });
});

describe('traiterScanRetrait — émission immédiate + append arrière-plan (revue 4.3)', () => {
  const MAINTENANT = new Date(2027, 4, 16, 6, 12, 30);

  it('append ok : succès immédiat SANS note, index optimiste à jour, termine sans note', async () => {
    const retraits = new Map<string, Date>();
    const ajouter = vi.fn(async () => true);

    const { retour, termine } = traiterScanRetrait(
      `azzel-e1:${JETON_74}`,
      INDEX,
      retraits,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );

    // Émission immédiate : le voyant/bip ne dépendent PAS de l'outbox.
    expect(retour.resultat.etat).toBe('succès');
    expect(retour.note).toBeUndefined();
    // Index optimiste : un double-scan immédiat ressortirait déjà en doublon.
    expect(retraits.get(JETON_74)).toEqual(MAINTENANT);

    const final = await termine;
    expect(final.note).toBeUndefined();
    expect(retraits.get(JETON_74)).toEqual(MAINTENANT);
    expect(ajouter).toHaveBeenCalledTimes(1);
  });

  it('append refusé : note « NON enregistré » + ROLLBACK de l’index optimiste', async () => {
    const retraits = new Map<string, Date>();
    const ajouter = vi.fn(async () => false);

    const { retour, termine } = traiterScanRetrait(
      `azzel-e1:${JETON_74}`,
      INDEX,
      retraits,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );

    // Immédiat : succès affiché sans attendre le verdict de l'outbox.
    expect(retour.resultat.etat).toBe('succès');
    expect(retour.note).toBeUndefined();
    expect(retraits.get(JETON_74)).toEqual(MAINTENANT);

    const final = await termine;
    expect(final.resultat.etat).toBe('succès');
    expect(final.note).toBe(NOTE_NON_ENREGISTRE);
    // Rollback : le retrait n'étant pas en outbox, le coureur re-scannera
    // en succès (pas de doublon fantôme).
    expect(retraits.has(JETON_74)).toBe(false);
    expect(ajouter).toHaveBeenCalledTimes(1);
  });

  it('doublon cross-session : inchangé — aucun append, index jamais modifié', async () => {
    const premierRetireA = new Date(2027, 4, 16, 5, 0, 0);
    const retraits = new Map<string, Date>([[JETON_74, premierRetireA]]);
    const ajouter = vi.fn(async () => true);

    const { retour, termine } = traiterScanRetrait(
      `azzel-e1:${JETON_74}`,
      INDEX,
      retraits,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );

    expect(retour.resultat.etat).toBe('doublon');
    expect((retour.resultat.premierRetireA as Date).getTime()).toBe(premierRetireA.getTime());
    expect(retour.note).toBeUndefined();
    const final = await termine;
    expect(final.resultat.etat).toBe('doublon');
    expect(ajouter).not.toHaveBeenCalled();
    // L'heure du PREMIER retrait reste la référence.
    expect(retraits.get(JETON_74)).toEqual(premierRetireA);
  });

  it('contexte incomplet (appareilId null — IDB refusée) : note immédiate, aucun append', async () => {
    const retraits = new Map<string, Date>();
    const ajouter = vi.fn(async () => true);

    const { retour, termine } = traiterScanRetrait(
      `azzel-e1:${JETON_74}`,
      INDEX,
      retraits,
      null,
      'edition-1',
      MAINTENANT,
      ajouter,
    );

    expect(retour.resultat.etat).toBe('succès');
    expect(retour.note).toBe(NOTE_NON_ENREGISTRE);
    expect(retraits.has(JETON_74)).toBe(false);
    const final = await termine;
    expect(final.note).toBe(NOTE_NON_ENREGISTRE);
    expect(ajouter).not.toHaveBeenCalled();
  });

  it('inconnu : retour définitif immédiat, aucun append', async () => {
    const ajouter = vi.fn(async () => true);
    const { retour, termine } = traiterScanRetrait(
      'nimporte-quoi',
      INDEX,
      new Map(),
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );
    expect(retour.resultat.etat).toBe('inconnu');
    expect((await termine).resultat.etat).toBe('inconnu');
    expect(ajouter).not.toHaveBeenCalled();
  });

  it('l’événement appendé respecte le contrat (payload minimal, jeton opaque)', async () => {
    const ajouter = vi.fn(async (_retrait: RetraitTerrain) => true);
    traiterScanRetrait(
      `azzel-e1:${JETON_74}`,
      INDEX,
      new Map(),
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );
    expect(ajouter).toHaveBeenCalledTimes(1);
    const [evenement] = ajouter.mock.calls[0] ?? [];
    expect(evenement).toEqual({
      version: 1,
      type: 'retrait',
      editionId: 'edition-1',
      jeton: JETON_74,
      horodatage: MAINTENANT.toISOString(),
      appareilId: 'appareil-1',
    });
  });
});

// ---------------------------------------------------------------------------
// Story 4.4 — mode passage : résolution + événement + libellés + orchestrateur.
// ---------------------------------------------------------------------------

const CHECKPOINT_A = 'mission-scan-km12';
const CHECKPOINT_B = 'mission-scan-km30';
const PASSAGES_VIDES: PassagesExistants = new Map();

describe('resoudrePassage — matrice checkpoints', () => {
  it('payload e1 connu, 1ᵉʳ passage à ce checkpoint : succès avec coureur et dossard', () => {
    const resultat = resoudrePassage(`azzel-e1:${JETON_74}`, INDEX, PASSAGES_VIDES, CHECKPOINT_A);
    expect(resultat.etat).toBe('succès');
    expect(resultat.dossard).toBe(74);
    expect(resultat.coureur?.prenom).toBe('Yani');
    expect(resultat.premierPasseA).toBeUndefined();
  });

  it('re-passage même coureur MÊME checkpoint : doublon, heure du PREMIER passage + clé composite', () => {
    // Index tel que reconstruit de l'outbox au démarrage — « toutes sessions
    // confondues » : le volontaire s'est déconnecté/reconnecté entre-temps.
    const premierPasseA = new Date('2027-05-16T07:05:09');
    const passagesExistants: PassagesExistants = new Map([
      [cleIndexPassage(JETON_74, CHECKPOINT_A), premierPasseA],
    ]);
    const resultat = resoudrePassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passagesExistants,
      CHECKPOINT_A,
    );
    expect(resultat.etat).toBe('doublon');
    expect(resultat.dossard).toBe(74);
    expect((resultat.premierPasseA as Date).getTime()).toBe(premierPasseA.getTime());
    // La clé composite voyage avec le doublon (rattachement de la note de
    // refus d'un append antérieur, côté client).
    expect(resultat.cleComposite).toBe(cleIndexPassage(JETON_74, CHECKPOINT_A));
  });

  it('même coureur à un AUTRE checkpoint : NOUVEAU succès (passage distinct, AD-6)', () => {
    const passagesExistants: PassagesExistants = new Map([
      [cleIndexPassage(JETON_74, CHECKPOINT_B), new Date('2027-05-16T07:30:00')],
    ]);
    const resultat = resoudrePassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passagesExistants,
      CHECKPOINT_A,
    );
    expect(resultat.etat).toBe('succès');
    expect(resultat.premierPasseA).toBeUndefined();
  });

  it('payload invalide ou jeton absent de l’annuaire : inconnu (identique 4.2/4.3)', () => {
    expect(resoudrePassage('74', INDEX, PASSAGES_VIDES, CHECKPOINT_A).etat).toBe('inconnu');
    expect(resoudrePassage('azzel-e2:quoi', INDEX, PASSAGES_VIDES, CHECKPOINT_A).etat).toBe(
      'inconnu',
    );
    expect(
      resoudrePassage('azzel-e1:QqRrSsTtUuVvWwXxYyZz12', INDEX, PASSAGES_VIDES, CHECKPOINT_A).etat,
    ).toBe('inconnu');
  });

  it('pur : la résolution ne modifie JAMAIS l’index des passages existants', () => {
    const index = new Map<string, Date>();
    resoudrePassage(`azzel-e1:${JETON_74}`, INDEX, index, CHECKPOINT_A);
    expect(index.size).toBe(0);
  });

  it('un autre coureur déjà passé ne dédoublonne JAMAIS ce coureur', () => {
    const passagesExistants: PassagesExistants = new Map([
      [cleIndexPassage(JETON_12, CHECKPOINT_A), new Date()],
    ]);
    expect(
      resoudrePassage(`azzel-e1:${JETON_74}`, INDEX, passagesExistants, CHECKPOINT_A).etat,
    ).toBe('succès');
  });
});

describe('creerEvenementPassage — l’événement à appendre, sans mutation cachée', () => {
  const SUCCES = resoudrePassage(`azzel-e1:${JETON_74}`, INDEX, PASSAGES_VIDES, CHECKPOINT_A);
  const HORODATAGE = new Date('2027-05-16T07:05:09');

  it('succès : événement minimal (NFR-7) — jeton opaque + checkpoint, JAMAIS de nom', () => {
    const evenement = creerEvenementPassage(
      SUCCES,
      'appareil-1',
      'edition-1',
      CHECKPOINT_A,
      HORODATAGE,
    );
    expect(evenement).toEqual({
      version: 1,
      type: 'passage',
      editionId: 'edition-1',
      jeton: JETON_74,
      checkpointId: CHECKPOINT_A,
      horodatage: HORODATAGE.toISOString(),
      appareilId: 'appareil-1',
    } satisfies PassageTerrain);
    expect(JSON.stringify(evenement)).not.toContain('Yani');
    expect(JSON.stringify(evenement)).not.toContain('Ulmani');
  });

  it('doublon et inconnu : null — rien à appendre', () => {
    const doublon = resoudrePassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      new Map([[cleIndexPassage(JETON_74, CHECKPOINT_A), HORODATAGE]]),
      CHECKPOINT_A,
    );
    expect(
      creerEvenementPassage(doublon, 'appareil-1', 'edition-1', CHECKPOINT_A, HORODATAGE),
    ).toBeNull();
    const inconnu = resoudrePassage('nimporte', INDEX, PASSAGES_VIDES, CHECKPOINT_A);
    expect(
      creerEvenementPassage(inconnu, 'appareil-1', 'edition-1', CHECKPOINT_A, HORODATAGE),
    ).toBeNull();
  });

  it('identifiants vides : null (défense — jamais d’événement hors contrat)', () => {
    expect(creerEvenementPassage(SUCCES, '', 'edition-1', CHECKPOINT_A, HORODATAGE)).toBeNull();
    expect(creerEvenementPassage(SUCCES, 'appareil-1', '', CHECKPOINT_A, HORODATAGE)).toBeNull();
    expect(creerEvenementPassage(SUCCES, 'appareil-1', 'edition-1', ' ', HORODATAGE)).toBeNull();
  });
});

describe('libelleVoyantPassage — libellés EXACTS du checkpoint (FR-13)', () => {
  const HEURE_SCAN = new Date(2027, 4, 16, 7, 5, 9);

  it('succès : « ✓ Passage enregistré — dossard N · HH:MM:SS » (heure appareil DANS le libellé)', () => {
    const resultat = resoudrePassage(`azzel-e1:${JETON_74}`, INDEX, PASSAGES_VIDES, CHECKPOINT_A);
    expect(libelleVoyantPassage(resultat, HEURE_SCAN)).toBe(
      '✓ Passage enregistré — dossard 74 · 07:05:09',
    );
  });

  it('doublon : « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS » avec l’heure du PREMIER passage', () => {
    const resultat = resoudrePassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      new Map([[cleIndexPassage(JETON_74, CHECKPOINT_A), new Date(2027, 4, 16, 7, 5, 9)]]),
      CHECKPOINT_A,
    );
    expect(libelleVoyantPassage(resultat, HEURE_SCAN)).toBe('↻ DÉJÀ PASSÉ — vu à 07:05:09');
  });

  it('doublon sans premierPasseA (donnée incohérente) : texte SANS heure, pas d’horaire bidon', () => {
    expect(libelleVoyantPassage({ etat: 'doublon', dossard: 74 }, HEURE_SCAN)).toBe(
      '↻ DÉJÀ PASSÉ',
    );
  });

  it('inconnu : « ⚠ DOSSARD INCONNU — revérifier » (identique 4.2/4.3)', () => {
    expect(libelleVoyantPassage({ etat: 'inconnu' }, HEURE_SCAN)).toBe(
      '⚠ DOSSARD INCONNU — revérifier',
    );
  });

  it('succès sans coureur/dossard (donnée incohérente) : texte dégradé, jamais « undefined »', () => {
    const degraded = libelleVoyantPassage({ etat: 'succès' }, HEURE_SCAN);
    expect(degraded).toBe('✓ Passage enregistré · 07:05:09');
    expect(degraded).not.toContain('undefined');
  });
});

describe('traiterScanPassage — émission immédiate + append arrière-plan (gabarit 4.3)', () => {
  const MAINTENANT = new Date(2027, 4, 16, 7, 5, 9);

  it('append ok : succès immédiat SANS note, index optimiste à jour, termine sans note', async () => {
    const passages = new Map<string, Date>();
    const ajouter = vi.fn(async () => true);

    const { retour, termine } = traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passages,
      CHECKPOINT_A,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );

    // Émission immédiate : le voyant/bip ne dépendent PAS de l'outbox.
    expect(retour.resultat.etat).toBe('succès');
    expect(retour.note).toBeUndefined();
    // Index optimiste : un double-scan immédiat ressortirait déjà en doublon.
    expect(passages.get(cleIndexPassage(JETON_74, CHECKPOINT_A))).toEqual(MAINTENANT);

    const final = await termine;
    expect(final.note).toBeUndefined();
    expect(passages.get(cleIndexPassage(JETON_74, CHECKPOINT_A))).toEqual(MAINTENANT);
    expect(ajouter).toHaveBeenCalledTimes(1);
  });

  it('append refusé : note « NON enregistré » + ROLLBACK de l’index optimiste', async () => {
    const passages = new Map<string, Date>();
    const ajouter = vi.fn(async () => false);

    const { retour, termine } = traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passages,
      CHECKPOINT_A,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );

    // Immédiat : succès affiché sans attendre le verdict de l'outbox.
    expect(retour.resultat.etat).toBe('succès');
    expect(retour.note).toBeUndefined();
    expect(passages.get(cleIndexPassage(JETON_74, CHECKPOINT_A))).toEqual(MAINTENANT);

    const final = await termine;
    expect(final.resultat.etat).toBe('succès');
    expect(final.note).toBe(NOTE_NON_ENREGISTRE);
    // Le refus porte la clé composite : le client pourra rattacher la note au
    // voyant doublon optimiste du même coureur×checkpoint.
    expect(final.resultat.cleComposite).toBe(cleIndexPassage(JETON_74, CHECKPOINT_A));
    // Rollback : le passage n'étant pas en outbox, le coureur re-scannera
    // en succès (pas de doublon fantôme).
    expect(passages.has(cleIndexPassage(JETON_74, CHECKPOINT_A))).toBe(false);
    expect(ajouter).toHaveBeenCalledTimes(1);
  });

  it('refus d’append APRÈS rescan affiché doublon optimiste : la note et la clé composite rejoignent le doublon', async () => {
    const passages = new Map<string, Date>();
    // L'append reste pendante le temps du re-scan (résolu au microtask
    // suivant) : l'entrée optimiste est en place quand le second scan résout.
    const ajouter = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          queueMicrotask(() => resolve(false));
        }),
    );

    const premier = traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passages,
      CHECKPOINT_A,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );
    expect(premier.retour.resultat.etat).toBe('succès');

    // Re-scan immédiat pendant l'append : doublon OPTIMISTE, affiché
    // « DÉJÀ PASSÉ » avec la clé composite correspondante.
    const second = traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passages,
      CHECKPOINT_A,
      'appareil-1',
      'edition-1',
      new Date(2027, 4, 16, 7, 6, 0),
      ajouter,
    );
    expect(second.retour.resultat.etat).toBe('doublon');
    expect(second.retour.resultat.cleComposite).toBe(cleIndexPassage(JETON_74, CHECKPOINT_A));

    // L'append du premier échoue : le refus porte la MÊME clé composite que
    // le doublon affiché — le client applique la note malgré la garde de
    // séquence (le doublon mentait sinon : rien n'est enregistré).
    const final = await premier.termine;
    expect(final.note).toBe(NOTE_NON_ENREGISTRE);
    expect(final.resultat.cleComposite).toBe(cleIndexPassage(JETON_74, CHECKPOINT_A));
    // Rollback effectif : plus d'entrée optimiste.
    expect(passages.size).toBe(0);
    // Le doublon, lui, n'a JAMAIS déclenché d'append.
    expect(ajouter).toHaveBeenCalledTimes(1);
  });

  it('doublon cross-session : inchangé — aucun append, index jamais modifié', async () => {
    const premierPasseA = new Date(2027, 4, 16, 6, 0, 0);
    const passages = new Map<string, Date>([
      [cleIndexPassage(JETON_74, CHECKPOINT_A), premierPasseA],
    ]);
    const ajouter = vi.fn(async () => true);

    const { retour, termine } = traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passages,
      CHECKPOINT_A,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );

    expect(retour.resultat.etat).toBe('doublon');
    expect((retour.resultat.premierPasseA as Date).getTime()).toBe(premierPasseA.getTime());
    expect(retour.note).toBeUndefined();
    const final = await termine;
    expect(final.resultat.etat).toBe('doublon');
    expect(ajouter).not.toHaveBeenCalled();
    // L'heure du PREMIER passage reste la référence.
    expect(passages.get(cleIndexPassage(JETON_74, CHECKPOINT_A))).toEqual(premierPasseA);
  });

  it('autre checkpoint juste après : NOUVEAU succès, DEUX clés d’index distinctes', async () => {
    const passages = new Map<string, Date>();
    const ajouter = vi.fn(async () => true);
    traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passages,
      CHECKPOINT_A,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );
    const { retour } = traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passages,
      CHECKPOINT_B,
      'appareil-1',
      'edition-1',
      new Date(2027, 4, 16, 7, 30, 0),
      ajouter,
    );
    expect(retour.resultat.etat).toBe('succès');
    expect(passages.size).toBe(2);
    expect(ajouter).toHaveBeenCalledTimes(2);
  });

  it('contexte incomplet (appareilId null — IDB refusée) : note immédiate, aucun append', async () => {
    const passages = new Map<string, Date>();
    const ajouter = vi.fn(async () => true);

    const { retour, termine } = traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passages,
      CHECKPOINT_A,
      null,
      'edition-1',
      MAINTENANT,
      ajouter,
    );

    expect(retour.resultat.etat).toBe('succès');
    expect(retour.note).toBe(NOTE_NON_ENREGISTRE);
    expect(passages.size).toBe(0);
    const final = await termine;
    expect(final.note).toBe(NOTE_NON_ENREGISTRE);
    expect(ajouter).not.toHaveBeenCalled();
  });

  it('checkpointId null (défense — mission absente) : note immédiate, aucun append', async () => {
    const passages = new Map<string, Date>();
    const ajouter = vi.fn(async () => true);

    const { retour, termine } = traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      passages,
      null,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );

    expect(retour.resultat.etat).toBe('succès');
    expect(retour.note).toBe(NOTE_NON_ENREGISTRE);
    expect(passages.size).toBe(0);
    await expect(termine).resolves.toMatchObject({ note: NOTE_NON_ENREGISTRE });
    expect(ajouter).not.toHaveBeenCalled();
  });

  it('inconnu : retour définitif immédiat, aucun append', async () => {
    const ajouter = vi.fn(async () => true);
    const { retour, termine } = traiterScanPassage(
      'nimporte-quoi',
      INDEX,
      new Map(),
      CHECKPOINT_A,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );
    expect(retour.resultat.etat).toBe('inconnu');
    expect((await termine).resultat.etat).toBe('inconnu');
    expect(ajouter).not.toHaveBeenCalled();
  });

  it('l’événement appendé respecte le contrat (payload minimal, checkpoint inclus)', async () => {
    const ajouter = vi.fn(async (_passage: PassageTerrain) => true);
    traiterScanPassage(
      `azzel-e1:${JETON_74}`,
      INDEX,
      new Map(),
      CHECKPOINT_A,
      'appareil-1',
      'edition-1',
      MAINTENANT,
      ajouter,
    );
    expect(ajouter).toHaveBeenCalledTimes(1);
    const [evenement] = ajouter.mock.calls[0] ?? [];
    expect(evenement).toEqual({
      version: 1,
      type: 'passage',
      editionId: 'edition-1',
      jeton: JETON_74,
      checkpointId: CHECKPOINT_A,
      horodatage: MAINTENANT.toISOString(),
      appareilId: 'appareil-1',
    });
  });
});
