import { describe, expect, it } from 'vitest';

import { encoderPayloadEdossard, type CoureurAnnuaire } from '@azzel/shared';

import {
  formatHeureVoyant,
  libelleVoyantScan,
  resoudreEtEnregistrer,
  resoudreScan,
  type DejaVus,
} from './etats-scan';

// Story 4.2 — matrice complète de la logique pure des trois états : succès,
// doublon de session (le premier reste la référence), inconnu (payload
// invalide OU jeton absent de l'annuaire). Libellés exacts du voyant.

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
