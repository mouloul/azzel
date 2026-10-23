import { describe, expect, it, vi } from 'vitest';

import {
  encoderPayloadEdossard,
  type CoureurAnnuaire,
  type RetraitTerrain,
} from '@azzel/shared';

import {
  NOTE_NON_ENREGISTRE,
  creerEvenementRetrait,
  formatHeureVoyant,
  libelleVoyantRetrait,
  libelleVoyantScan,
  resoudreEtEnregistrer,
  resoudreRetrait,
  resoudreScan,
  traiterScanRetrait,
  type DejaVus,
  type RetraitsExistants,
} from './etats-scan';

// Story 4.2 — matrice complète de la logique pure des trois états : succès,
// doublon de session (le premier reste la référence), inconnu (payload
// invalide OU jeton absent de l'annuaire). Libellés exacts du voyant.
// Story 4.3 — matrice retrait : dédoublonnage PERSISTANT (index outbox passé
// en paramètre, cross-session), libellés dédiés, événement retourné SANS
// mutation cachée.

const COUREUR_74: CoureurAnnuaire = {
  dossard: 74,
  nom: 'Ulmani',
  prenom: 'Yani',
  jeton: encoderPayloadEdossard('AbCdEfGhIjKlMnOpQrStUv'), // via le préfixe
};

function coureur(dossard: number, prenom: string, jeton: string): CoureurAnnuaire {
  return { dossard, nom: `Nom${dossard}`, prenom, jeton };
}

const JETON_74 = 'AbCdEfGhIjKlMnOpQrStUv';
const JETON_12 = 'ZyXwVuTsRqPoNmLkJiHgFe';

const INDEX = new Map<string, CoureurAnnuaire>([
  [JETON_74, coureur(74, 'Yani', JETON_74)],
  [JETON_12, coureur(12, 'Iness', JETON_12)],
]);

const SANS_VUS: DejaVus = new Map();

describe('resoudreScan — matrice des trois états', () => {
  it('payload e1 connu, jamais vu : succès avec coureur et dossard', () => {
    const resultat = resoudreScan(`azzel-e1:${JETON_74}`, INDEX, SANS_VUS);
    expect(resultat.etat).toBe('succès');
    expect(resultat.coureur?.dossard).toBe(74);
    expect(resultat.coureur?.prenom).toBe('Yani');
    expect(resultat.dossard).toBe(74);
    expect(resultat.premierVuA).toBeUndefined();
  });

  it('payload e1 déjà vu en session : doublon, premierVuA = la PREMIÈRE lecture', () => {
    const premierVuA = new Date('2027-05-16T06:12:30');
    const dejaVus: DejaVus = new Map([[JETON_74, premierVuA]]);
    const resultat = resoudreScan(`azzel-e1:${JETON_74}`, INDEX, dejaVus);
    expect(resultat.etat).toBe('doublon');
    expect(resultat.dossard).toBe(74);
    expect(resultat.premierVuA).toBeInstanceOf(Date);
    expect((resultat.premierVuA as Date).getTime()).toBe(premierVuA.getTime());
  });

  it('payload non-e1 (texte quelconque, autre version, dossard nu) : inconnu', () => {
    for (const payload of ['https://azzel.exemple.dz', 'azzel-e2:quoi', '74', '']) {
      expect(resoudreScan(payload, INDEX, SANS_VUS).etat).toBe('inconnu');
    }
  });

  it('payload e1 bien formé mais jeton absent de l’annuaire : inconnu', () => {
    const jetonInconnu = 'QqRrSsTtUuVvWwXxYyZz12';
    const resultat = resoudreScan(`azzel-e1:${jetonInconnu}`, INDEX, SANS_VUS);
    expect(resultat.etat).toBe('inconnu');
    expect(resultat.coureur).toBeUndefined();
    expect(resultat.dossard).toBeUndefined();
  });

  it('jeton mal formé (longueur, caractères) : inconnu, jamais d’exception', () => {
    expect(resoudreScan('azzel-e1:court', INDEX, SANS_VUS).etat).toBe('inconnu');
    expect(resoudreScan('azzel-e1:caractères-interdits*çà', INDEX, SANS_VUS).etat).toBe(
      'inconnu',
    );
  });

  it('jeton valide ne dédoublonne JAMAIS avec un autre coureur', () => {
    const dejaVus: DejaVus = new Map([[JETON_74, new Date()]]);
    expect(resoudreScan(`azzel-e1:${JETON_12}`, INDEX, dejaVus).etat).toBe('succès');
  });

  it('index vide : tout payload e1 est inconnu (pas de scan à l’aveugle)', () => {
    expect(resoudreScan(`azzel-e1:${JETON_74}`, new Map(), SANS_VUS).etat).toBe('inconnu');
  });
});

describe('libelleVoyantScan — libellés exacts du voyant (jamais la couleur seule)', () => {
  it('succès : « ✓ Dossard N — {prénom} »', () => {
    const resultat = resoudreScan(`azzel-e1:${JETON_74}`, INDEX, SANS_VUS);
    expect(libelleVoyantScan(resultat)).toBe('✓ Dossard 74 — Yani');
  });

  it('doublon : « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS » avec l’heure du premier passage', () => {
    const premierVuA = new Date('2027-05-16T06:12:30');
    const resultat = resoudreScan(
      `azzel-e1:${JETON_74}`,
      INDEX,
      new Map([[JETON_74, premierVuA]]),
    );
    expect(libelleVoyantScan(resultat)).toBe('↻ DÉJÀ PASSÉ — vu à 06:12:30');
  });

  it('doublon sans premierVuA (donnée incohérente) : texte SANS heure, pas d’horodatage bidon', () => {
    expect(libelleVoyantScan({ etat: 'doublon', dossard: 74 })).toBe('↻ DÉJÀ PASSÉ');
  });

  it('inconnu : « ⚠ DOSSARD INCONNU — revérifier » (label du contrat shared)', () => {
    expect(libelleVoyantScan({ etat: 'inconnu' })).toBe('⚠ DOSSARD INCONNU — revérifier');
  });
});

describe('formatHeureVoyant — heure locale mono de l’appareil', () => {
  it('HH:MM:SS à deux chiffres, heure locale (pas d’UTC forcé)', () => {
    const date = new Date(2027, 4, 16, 7, 5, 9);
    expect(formatHeureVoyant(date)).toBe('07:05:09');
  });

  it('padStart sur chaque composant', () => {
    expect(formatHeureVoyant(new Date(2027, 4, 16, 23, 0, 1))).toBe('23:00:01');
  });
});

// Garde anti-doublon de fixture : COUREUR_74 encode le même jeton que JETON_74.
describe('fixtures', () => {
  it('le jeton de la fixture respecte le contrat (22 caractères base64url)', () => {
    expect(COUREUR_74.jeton).toBe(`azzel-e1:${JETON_74}`);
    expect(JETON_74).toHaveLength(22);
  });
});

describe('resoudreEtEnregistrer — le vrai câblage du scanner', () => {
  it('1ʳᵉ lecture : succès ET jeton enregistré dans la session avec l’heure fournie', () => {
    const dejaVus = new Map<string, Date>();
    const heure = new Date('2027-05-16T06:12:30');
    const resultat = resoudreEtEnregistrer(`azzel-e1:${JETON_74}`, INDEX, dejaVus, heure);
    expect(resultat.etat).toBe('succès');
    expect(dejaVus.get(JETON_74)).toBe(heure);
  });

  it('2ᵉ lecture du même jeton : doublon avec premierVuA = la 1ʳᵉ heure (le premier reste)', () => {
    const dejaVus = new Map<string, Date>();
    const premiereHeure = new Date('2027-05-16T06:12:30');
    resoudreEtEnregistrer(`azzel-e1:${JETON_74}`, INDEX, dejaVus, premiereHeure);
    const resultat = resoudreEtEnregistrer(
      `azzel-e1:${JETON_74}`,
      INDEX,
      dejaVus,
      new Date('2027-05-16T06:20:00'),
    );
    expect(resultat.etat).toBe('doublon');
    expect((resultat.premierVuA as Date).getTime()).toBe(premiereHeure.getTime());
  });

  it('index vide : inconnu, RIEN d’enregistré (pas de scan à l’aveugle)', () => {
    const dejaVus = new Map<string, Date>();
    const resultat = resoudreEtEnregistrer(
      `azzel-e1:${JETON_74}`,
      new Map(),
      dejaVus,
      new Date(),
    );
    expect(resultat.etat).toBe('inconnu');
    expect(dejaVus.size).toBe(0);
  });

  it('payload invalide : inconnu, rien d’enregistré', () => {
    const dejaVus = new Map<string, Date>();
    resoudreEtEnregistrer('nimporte-quoi', INDEX, dejaVus, new Date());
    expect(dejaVus.size).toBe(0);
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
