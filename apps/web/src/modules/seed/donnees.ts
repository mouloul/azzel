import type { Genre, TshirtSize } from '@/modules/inscriptions/domain';
import type { MissionType } from '@/modules/missions/domain';

/**
 * Story 8.3 — jeu de données fictif « édition complète ».
 *
 * CE FICHIER NE CONTIENT QUE DES DONNÉES. La mécanique (services, idempotence,
 * neutralisation des emails) vit dans `seed.ts` : on doit pouvoir relire ce
 * qu'il y a dans la base de recette sans lire une ligne de code.
 *
 * RÈGLE CARDINALE (épopée 8) : aucune donnée réelle. Les noms sont inventés,
 * les téléphones appartiennent à une plage d'exemple, et TOUTES les adresses
 * email sont sur un domaine réservé (RFC 2606 : `.invalid` n'est jamais
 * délégué) — aucun message du seed ne peut atteindre une boîte existante.
 */

/** Domaine réservé RFC 2606 : aucune de ces adresses n'existe ni n'existera. */
export const SEED_EMAIL_DOMAINE = 'seed.azzel.invalid';

/** Marqueur d'identité stable : tout compte dont l'email finit ainsi vient du seed. */
export const SEED_EMAIL_SUFFIXE = `@${SEED_EMAIL_DOMAINE}`;

/** Stade du dossier visé par le seed — pilote la chaîne de services appelée. */
export type StadeDossier =
  /** Inscription saisie, rien d'autre : le dossier est « en constitution » nu. */
  | 'inscription seule'
  /**
   * Inscription + décharge/règlement + preuve CCP : le dépôt de la preuve
   * place le dossier « en validation », prêt à être examiné.
   */
  | 'dossier complet'
  /** Dossier complet puis validé par l'organisateur (dossard + e-dossard). */
  | 'validé'
  /** Dossier complet (en validation) puis refusé, avec motif. */
  | 'refusé';

export interface CoureurFictif {
  /** Clé stable : porte l'identité du compte (email), jamais réattribuée. */
  cle: string;
  prenom: string;
  nom: string;
  dateNaissance: string;
  epreuve: 'longue' | 'moyenne';
  tailleTshirt: TshirtSize;
  genre: Genre;
  /** Code de wilaya ('15') ou 'ETR' — voir PROVENANCES. */
  wilaya: string;
  /** Code ISO du pays, seulement pour 'ETR'. */
  pays: string | null;
  stade: StadeDossier;
  /** Obligatoire si et seulement si `stade === 'refusé'`. */
  motifRefus: string | null;
}

/**
 * Table des coureurs fictifs — une ligne par coureur, lisible d'un trait.
 * Volume FIXE (50) : personne n'a demandé à le faire varier, et un paramètre
 * serait une entrée à valider de plus.
 *
 * Répartition : 22 validés · 10 dossiers en validation (à décider) · 12 inscriptions
 * nues · 6 refusés avec motif.
 */
type Ligne = readonly [
  prenom: string,
  nom: string,
  dateNaissance: string,
  epreuve: 'longue' | 'moyenne',
  tailleTshirt: TshirtSize,
  genre: Genre,
  stade: StadeDossier,
  motifRefus?: string,
];

const LIGNES: readonly Ligne[] = [
  // ——— 22 dossiers validés (dossard + e-dossard) ———
  ['Yani', 'Ulahianne', '1990-05-12', 'longue', 'M', 'H', 'validé'],
  ['Tilelli', 'Bouzegrane', '1994-11-03', 'longue', 'S', 'F', 'validé'],
  ['Massinissa', 'Ikhervane', '1986-02-27', 'longue', 'L', 'H', 'validé'],
  ['Dihya', 'Amezzour', '1999-07-19', 'moyenne', 'XS', 'F', 'validé'],
  ['Idir', 'Tazerout', '1978-09-08', 'longue', 'XL', 'H', 'validé'],
  ['Lyes', 'Boufarik-Nath', '2001-03-14', 'moyenne', 'M', 'H', 'validé'],
  ['Kahina', 'Imzizwa', '1992-12-30', 'longue', 'S', 'F', 'validé'],
  ['Mokrane', 'Sedkaoui', '1968-04-05', 'moyenne', 'L', 'H', 'validé'],
  ['Thiziri', 'Ahgoun', '1997-06-22', 'longue', 'XS', 'F', 'validé'],
  ['Ferhat', 'Ouzellague', '1983-01-17', 'longue', 'M', 'H', 'validé'],
  ['Sabrina', 'Mendjeli', '1995-08-11', 'moyenne', 'S', 'F', 'validé'],
  ['Arezki', 'Tiferdoud', '1974-10-29', 'longue', 'XL', 'H', 'validé'],
  ['Numidia', 'Bekhouche', '2004-05-02', 'moyenne', 'XS', 'F', 'validé'],
  ['Hocine', 'Larmandi', '1988-03-23', 'longue', 'L', 'H', 'validé'],
  ['Melaz', 'Ifrikhen', '1991-09-15', 'longue', 'M', 'H', 'validé'],
  ['Katia', 'Semmoudi', '1996-02-06', 'moyenne', 'S', 'F', 'validé'],
  ['Juba', 'Azrarak', '1980-12-09', 'longue', 'L', 'H', 'validé'],
  ['Lounis', 'Berkoukas', '1963-07-28', 'moyenne', 'XXL', 'H', 'validé'],
  ['Silya', 'Mehdaoui-Tazi', '2000-04-16', 'moyenne', 'XS', 'F', 'validé'],
  ['Rayane', 'Ouchemoum', '1993-11-21', 'longue', 'M', 'H', 'validé'],
  ['Damya', 'Zelmati', '1987-05-30', 'longue', 'S', 'F', 'validé'],
  ['Akli', 'Ghebrit-Nath', '1971-08-04', 'moyenne', 'L', 'H', 'validé'],

  // ——— 10 dossiers complets, « en validation » : en attente de décision ———
  ['Siham', 'Boudjellal', '1998-01-25', 'longue', 'S', 'F', 'dossier complet'],
  ['Mehdi', 'Tabouche', '1985-10-13', 'moyenne', 'M', 'H', 'dossier complet'],
  ['Lydia', 'Aït-Ferroudj', '2002-06-07', 'moyenne', 'XS', 'F', 'dossier complet'],
  ['Sofiane', 'Hemdani', '1979-03-31', 'longue', 'XL', 'H', 'dossier complet'],
  ['Nawel', 'Chettouane', '1990-09-18', 'longue', 'S', 'F', 'dossier complet'],
  ['Belaid', 'Oussedik-Nath', '1966-12-02', 'moyenne', 'L', 'H', 'dossier complet'],
  ['Amayas', 'Ferkioui', '1995-07-26', 'longue', 'M', 'H', 'dossier complet'],
  ['Tinhinane', 'Begriche', '2003-02-11', 'moyenne', 'XS', 'F', 'dossier complet'],
  ['Ghilas', 'Merabtine', '1982-04-20', 'longue', 'L', 'H', 'dossier complet'],
  ['Ourida', 'Slimanoud', '1976-11-14', 'moyenne', 'M', 'F', 'dossier complet'],

  // ——— 12 inscriptions nues (ni preuve ni acceptations) ———
  ['Anis', 'Khelloufi-Nath', '1992-08-03', 'longue', 'M', 'H', 'inscription seule'],
  ['Louiza', 'Benhamouche', '1989-05-27', 'moyenne', 'S', 'F', 'inscription seule'],
  ['Zinedine', 'Aroumane', '2005-01-09', 'moyenne', 'XS', 'H', 'inscription seule'],
  ['Feriel', 'Draoudi', '1997-10-22', 'longue', 'S', 'F', 'inscription seule'],
  ['Koceila', 'Benzerga', '1984-06-15', 'longue', 'L', 'H', 'inscription seule'],
  ['Hayet', 'Oulmane', '1972-02-28', 'moyenne', 'M', 'F', 'inscription seule'],
  ['Mourad', 'Tighilt', '1991-12-06', 'longue', 'XL', 'H', 'inscription seule'],
  ['Célina', 'Rabahi-Nath', '2006-03-19', 'moyenne', 'XS', 'F', 'inscription seule'],
  ['Djamel', 'Aissaoudi', '1981-09-01', 'longue', 'L', 'H', 'inscription seule'],
  ['Wissam', 'Belkacemine', '1999-04-24', 'moyenne', 'S', 'F', 'inscription seule'],
  ['Samir', 'Hamouche-Nath', '1975-07-12', 'longue', 'XXL', 'H', 'inscription seule'],
  ['Meriem', 'Zerrouki', '1993-01-05', 'moyenne', 'M', 'F', 'inscription seule'],

  // ——— 6 dossiers refusés, motif obligatoire ———
  [
    'Karim',
    'Bouanani',
    '1988-11-17',
    'longue',
    'M',
    'H',
    'refusé',
    'Preuve de paiement illisible : le montant et la date du versement CCP n’apparaissent pas.',
  ],
  [
    'Nadia',
    'Lamrioui',
    '1994-03-08',
    'moyenne',
    'S',
    'F',
    'refusé',
    'Le versement CCP correspond à une autre épreuve : modifier l’inscription, puis déposer une preuve au tarif de La Boucle Moyenne.',
  ],
  [
    'Smail',
    'Ouaguenouni',
    '1970-06-21',
    'moyenne',
    'L',
    'H',
    'refusé',
    'Montant incomplet : il manque les frais de dossier. Après régularisation, modifier l’inscription puis déposer une nouvelle preuve.',
  ],
  [
    'Imane',
    'Teffahi',
    '2001-08-29',
    'longue',
    'XS',
    'F',
    'refusé',
    'Preuve déposée au nom d’une autre personne : le titulaire du versement doit être le coureur inscrit.',
  ],
  [
    'Rachid',
    'Mehenni-Nath',
    '1965-02-13',
    'moyenne',
    'XL',
    'H',
    'refusé',
    'Document hors sujet : la pièce déposée est une carte d’identité, pas un reçu de versement CCP.',
  ],
  [
    'Dalila',
    'Yahiaoudi',
    '1986-12-25',
    'longue',
    'M',
    'F',
    'refusé',
    'Versement daté après la clôture des inscriptions : le dossier ne peut pas être validé en l’état.',
  ],
];

/**
 * Provenances, cyclées sur la table : déterministes (même coureur, même
 * wilaya à chaque seed), à dominante Tizi Ouzou comme la vraie course, avec
 * des wilayas voisines et des participants de l'étranger. Aucun coureur
 * fictif ne demande l'hébergement : un Tizi-Ouzéen n'y a pas droit, et le
 * contingent reste entier pour la recette.
 */
const PROVENANCES: readonly { wilaya: string; pays: string | null }[] = [
  { wilaya: '15', pays: null }, // Tizi Ouzou
  { wilaya: '06', pays: null }, // Béjaïa
  { wilaya: '15', pays: null },
  { wilaya: '16', pays: null }, // Alger
  { wilaya: '10', pays: null }, // Bouira
  { wilaya: '15', pays: null },
  { wilaya: '35', pays: null }, // Boumerdès
  { wilaya: 'ETR', pays: 'FR' }, // Étranger — France
  { wilaya: '15', pays: null },
  { wilaya: '19', pays: null }, // Sétif
  { wilaya: '15', pays: null },
  { wilaya: 'ETR', pays: 'CA' }, // Étranger — Canada
];

/** Prénoms des contacts d'urgence, cyclés sur la table — tout aussi inventés. */
const CONTACTS_URGENCE = ['Lounis', 'Ouiza', 'Mouloud', 'Farida', 'Saïd', 'Nouara'];

/**
 * Téléphones : plage d'exemple `+213 555 01 nnnn`, jamais attribuée.
 * Deux numéros distincts par coureur (le sien, celui de son contact).
 */
function telephoneFictif(index: number, variante: 0 | 1): string {
  const numero = (index + 1) * 2 + variante;
  return `+213 555 01 ${String(numero).padStart(4, '0')}`;
}

function cleCoureur(index: number): string {
  return `c${String(index + 1).padStart(2, '0')}`;
}

export const COUREURS_FICTIFS: readonly CoureurFictif[] = LIGNES.map((ligne, index) => {
  const [prenom, nom, dateNaissance, epreuve, tailleTshirt, genre, stade, motifRefus] =
    ligne;
  const provenance = PROVENANCES[index % PROVENANCES.length] as (typeof PROVENANCES)[number];
  return {
    cle: cleCoureur(index),
    prenom,
    nom,
    dateNaissance,
    epreuve,
    tailleTshirt,
    genre,
    wilaya: provenance.wilaya,
    pays: provenance.pays,
    stade,
    motifRefus: motifRefus ?? null,
  };
});

/** Identité stable du compte coureur : l'email, et rien d'autre. */
export function emailCoureur(cle: string): string {
  return `coureur-${cle}${SEED_EMAIL_SUFFIXE}`;
}

export function telephoneCoureur(index: number): string {
  return telephoneFictif(index, 0);
}

export function contactUrgenceCoureur(coureur: CoureurFictif, index: number): {
  nom: string;
  telephone: string;
} {
  const prenom = CONTACTS_URGENCE[index % CONTACTS_URGENCE.length] as string;
  return { nom: `${prenom} ${coureur.nom}`, telephone: telephoneFictif(index, 1) };
}

/**
 * Organisateur fictif qui PREND les décisions de dossier : `decided_by` pointe
 * sur un compte, il en faut donc un. Ce n'est PAS un compte d'accès : le comité
 * se connecte avec ses propres adresses (AZZEL_ADMIN_EMAILS), celle-ci ne
 * reçoit jamais rien.
 */
export const ORGANISATEUR_FICTIF = {
  cle: 'o01',
  nom: 'Commission des dossiers (fictif)',
  email: `organisateur-o01${SEED_EMAIL_SUFFIXE}`,
} as const;

export interface VolontaireFictif {
  cle: string;
  nom: string;
  telephone: string;
}

const NOMS_VOLONTAIRES: readonly string[] = [
  'Hamid Azergui',
  'Nabila Tifrit',
  'Salem Boukhalfoune',
  'Yasmina Idjeraoui',
  'Rabah Sellaouti',
  'Lynda Meziani-Nath',
  'Toufik Ammarouche',
  'Souad Kerrouche',
  'Madjid Oulhadj',
  'Fatma Bensidhoum',
  'Karima Lahlouhi',
  'Slimane Djerroud',
];

export const VOLONTAIRES_FICTIFS: readonly VolontaireFictif[] = NOMS_VOLONTAIRES.map(
  (nom, index) => ({
    cle: `v${String(index + 1).padStart(2, '0')}`,
    nom,
    telephone: `+213 555 02 ${String(index + 1).padStart(4, '0')}`,
  }),
);

export function emailVolontaire(cle: string): string {
  return `volontaire-${cle}${SEED_EMAIL_SUFFIXE}`;
}

/** Repère stable d'un point de scan, utilisé par le plan de passages. */
export type Checkpoint = 'cp1' | 'cp2' | 'arrivee';

export interface MissionFictive {
  titre: string;
  type: MissionType;
  /** Heure UTC « HH:MM » le JOUR DE LA COURSE (la date vient de l'édition). */
  debut: string;
  fin: string;
  consignes: string | null;
  estArrivee: boolean;
  /** Barrière horaire « HH:MM » — réservée aux missions `scan_checkpoint`. */
  barriere: string | null;
  /** Non nul = point de scan ciblé par les passages fictifs. */
  checkpoint: Checkpoint | null;
}

export interface SecteurFictif {
  nom: string;
  lieu: string;
  contact: string | null;
  missions: readonly MissionFictive[];
}

/** Découpage de l'édition : 4 secteurs, 8 missions couvrant les 6 types. */
export const SECTEURS_FICTIFS: readonly SecteurFictif[] = [
  {
    nom: 'Départ — Place du village',
    lieu: 'Aït-Aïssi, place centrale',
    contact: 'PC départ · +213 555 03 0001',
    missions: [
      {
        titre: 'Retrait des dossards',
        type: 'distribution_dossards',
        debut: '05:30',
        fin: '07:30',
        consignes: 'Vérifier l’e-dossard sur le téléphone du coureur avant de remettre la plaque.',
        estArrivee: false,
        barriere: null,
        checkpoint: null,
      },
      {
        titre: 'Accueil et orientation',
        type: 'accueil',
        debut: '05:30',
        fin: '08:30',
        consignes: 'Orienter vers le retrait des dossards puis vers le sas de départ.',
        estArrivee: false,
        barriere: null,
        checkpoint: null,
      },
    ],
  },
  {
    nom: 'Checkpoint 1 — Col des Oliviers',
    lieu: 'Piste forestière, km 9',
    contact: 'Radio canal 2',
    missions: [
      {
        titre: 'Scan checkpoint 1',
        type: 'scan_checkpoint',
        debut: '07:00',
        fin: '11:00',
        consignes: 'Scanner chaque e-dossard ; en cas de QR illisible, saisir le dossard à la main.',
        estArrivee: false,
        barriere: '10:30',
        checkpoint: 'cp1',
      },
      {
        titre: 'Sécurité tronçon km 7–12',
        type: 'securite_troncon',
        debut: '06:45',
        fin: '11:15',
        consignes: 'Signaler toute sortie de parcours au PC course par radio.',
        estArrivee: false,
        barriere: null,
        checkpoint: null,
      },
    ],
  },
  {
    nom: 'Checkpoint 2 — Crête de Tizi',
    lieu: 'Crête, km 21',
    contact: 'Radio canal 3',
    missions: [
      {
        titre: 'Scan checkpoint 2',
        type: 'scan_checkpoint',
        debut: '08:00',
        fin: '13:00',
        consignes: 'Barrière horaire stricte : au-delà, rediriger vers la navette de repli.',
        estArrivee: false,
        barriere: '12:30',
        checkpoint: 'cp2',
      },
    ],
  },
  {
    nom: 'Arrivée — Stade municipal',
    lieu: 'Stade municipal d’Aït-Aïssi',
    contact: 'PC course · +213 555 03 0002',
    missions: [
      {
        titre: 'Scan arrivée',
        type: 'scan_checkpoint',
        debut: '08:30',
        fin: '14:30',
        consignes: 'Point d’arrivée officiel : c’est ce scan qui arrête le chrono.',
        estArrivee: true,
        barriere: null,
        checkpoint: 'arrivee',
      },
      {
        titre: 'Sécurité zone d’arrivée',
        type: 'securite_arrivee',
        debut: '08:15',
        fin: '14:45',
        consignes: 'Dégager le couloir d’arrivée, orienter vers le ravitaillement.',
        estArrivee: false,
        barriere: null,
        checkpoint: null,
      },
      {
        titre: 'Annonces et speaker',
        type: 'communication',
        debut: '08:15',
        fin: '15:00',
        consignes: 'Annoncer les arrivées et les consignes de remise des récompenses.',
        estArrivee: false,
        barriere: null,
        checkpoint: null,
      },
    ],
  },
];

/**
 * Affectations : chaque mission reçoit ses volontaires, par clé. Les créneaux
 * attribués à un même volontaire ne se chevauchent pas — l'écran admin montre
 * une couverture propre, sans avertissement de conflit parasite.
 */
export const AFFECTATIONS_FICTIVES: readonly {
  /** L'unicité SQL porte sur (secteur, titre) : les deux sont nécessaires. */
  secteur: string;
  mission: string;
  volontaires: readonly string[];
}[] = [
  {
    secteur: 'Départ — Place du village',
    mission: 'Retrait des dossards',
    volontaires: ['v01', 'v02'],
  },
  {
    secteur: 'Départ — Place du village',
    mission: 'Accueil et orientation',
    volontaires: ['v03'],
  },
  {
    secteur: 'Checkpoint 1 — Col des Oliviers',
    mission: 'Scan checkpoint 1',
    volontaires: ['v04', 'v05'],
  },
  {
    secteur: 'Checkpoint 1 — Col des Oliviers',
    mission: 'Sécurité tronçon km 7–12',
    volontaires: ['v06'],
  },
  {
    secteur: 'Checkpoint 2 — Crête de Tizi',
    mission: 'Scan checkpoint 2',
    volontaires: ['v07', 'v08'],
  },
  {
    secteur: 'Arrivée — Stade municipal',
    mission: 'Scan arrivée',
    volontaires: ['v09', 'v10'],
  },
  {
    secteur: 'Arrivée — Stade municipal',
    mission: 'Sécurité zone d’arrivée',
    volontaires: ['v11'],
  },
  // « Annonces et speaker » reste VACANTE : le comité doit pouvoir exercer
  // l'affectation d'une mission non couverte.
  {
    secteur: 'Arrivée — Stade municipal',
    mission: 'Annonces et speaker',
    volontaires: [],
  },
];

/** Heures de départ officielles, échelonnées (UTC, jour de la course). */
export const HEURES_DEPART_FICTIVES: Readonly<Record<'longue' | 'moyenne', string>> = {
  longue: '07:00',
  moyenne: '08:00',
};

/**
 * Plan des événements terrain : de quoi faire vivre le chrono, les classements
 * et les rapports sans rejouer une course entière. Les coureurs concernés sont
 * les N PREMIERS validés (ordre de la table ci-dessus), ceux-là seuls ont un
 * jeton e-dossard à scanner.
 *
 * Les horaires sont RELATIFS AU DÉPART DE L'ÉPREUVE DU COUREUR, pas à une
 * heure d'horloge unique : les départs sont échelonnés (La Grande Boucle à 07:00, La
 * Boucle Moyenne à 08:00) et un passage antérieur au départ donnerait un temps de
 * classement négatif. `minutesDepuisDepart` est donc strictement positif pour
 * les passages ; seul le retrait de dossard précède le départ.
 */
export const PLAN_TERRAIN = {
  /** Retrait de dossard, 55 minutes avant le départ de son épreuve. */
  retrait: { coureurs: 20, minutesDepuisDepart: -55, intervalleMinutes: 2 },
  cp1: { coureurs: 18, minutesDepuisDepart: 38, intervalleMinutes: 3 },
  cp2: { coureurs: 14, minutesDepuisDepart: 96, intervalleMinutes: 4 },
  arrivee: { coureurs: 11, minutesDepuisDepart: 142, intervalleMinutes: 5 },
} as const;

/** Identifiant d'appareil scanneur fictif porté par les événements terrain. */
export const APPAREIL_FICTIF = 'seed-scanneur-01';

/**
 * Texte de la preuve de paiement fictive. Elle doit être RÉELLEMENT AFFICHABLE
 * (valider un dossier est le geste que la recette doit permettre d'exercer) et
 * dire sur elle-même qu'elle ne vaut rien. ASCII pur : le PDF est encodé en
 * latin-1 avec la police Helvetica standard.
 */
export const LIGNES_PREUVE_FICTIVE: readonly string[] = [
  'RECU DE VERSEMENT CCP - DOCUMENT FICTIF',
  'Trail d Ait-Aissi, edition 2027',
  'Jeu de donnees de recette (story 8.3)',
  'Aucune valeur : ce recu n a jamais existe.',
];
