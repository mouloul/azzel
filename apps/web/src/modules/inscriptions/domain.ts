import {
  WILAYA_ETRANGER,
  WILAYA_TIZI_OUZOU,
  estPaysValide,
  estProvenanceValide,
} from './provenance';

export const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

export type TshirtSize = (typeof TSHIRT_SIZES)[number];

export type AgeCategory = 'Senior' | 'V1' | 'V2' | 'V3';

export const AGE_CATEGORY_LABELS: Record<AgeCategory, string> = {
  Senior: 'Senior (18–39 ans)',
  V1: 'Vétéran 1 (40–49 ans)',
  V2: 'Vétéran 2 (50–59 ans)',
  V3: 'Vétéran 3 (60 ans et plus)',
};

export const GENRES = ['F', 'H'] as const;

export type Genre = (typeof GENRES)[number];

export const GENRE_LABELS: Record<Genre, string> = {
  F: 'Femme',
  H: 'Homme',
};

/**
 * Majorité exigée, appréciée à la date de la course : un coureur qui atteint
 * 18 ans entre son inscription et le départ est admis, un coureur qui les
 * atteint le lendemain ne l'est pas. Même référence que les catégories d'âge.
 */
export const MIN_AGE_AT_RACE = 18;

export const MAX_AGE_AT_RACE = 100;

export const COUREUR_STATUS_EN_CONSTITUTION = 'en constitution';

/**
 * Preuve déposée, décision de l'organisation attendue. Distinct de « en
 * constitution » : là c'est au coureur d'agir (verser, déposer), ici c'est à
 * l'organisation. Occupe sa place et n'expire jamais — le coureur a fait sa
 * part dans les temps, on ne lui reprend pas sa place parce que personne n'a
 * encore regardé son reçu.
 */
export const COUREUR_STATUS_EN_VALIDATION = 'en validation';

export const COUREUR_STATUS_VALIDE = 'validé';

export const COUREUR_STATUS_REFUSE = 'refusé';

export const COUREUR_STATUS_LISTE_ATTENTE = 'liste d’attente';

export const COUREUR_STATUS_EXPIREE = 'expirée';

export const COUREUR_STATUSES = [
  COUREUR_STATUS_EN_CONSTITUTION,
  COUREUR_STATUS_EN_VALIDATION,
  COUREUR_STATUS_VALIDE,
  COUREUR_STATUS_REFUSE,
  COUREUR_STATUS_LISTE_ATTENTE,
  COUREUR_STATUS_EXPIREE,
] as const;

/**
 * Statuts qui consomment une place du contingent.
 *
 * « En constitution » en fait partie : la place est RÉSERVÉE au coureur le
 * temps qu'il verse sa preuve, sinon deux cents dossiers en cours de paiement
 * laisseraient croire à deux cents places libres, et l'organisation se
 * retrouverait avec plus de versements que de dossards. « En validation »
 * aussi : le versement est fait, la décision seule manque.
 *
 * « Refusé », « expirée » et « liste d'attente » n'en consomment aucune : un
 * refus ou une expiration rend la place, une attente n'en a jamais pris.
 */
export const STATUTS_OCCUPANT_UNE_PLACE: readonly string[] = [
  COUREUR_STATUS_EN_CONSTITUTION,
  COUREUR_STATUS_EN_VALIDATION,
  COUREUR_STATUS_VALIDE,
];

/**
 * Statuts depuis lesquels « Modifier mon inscription » ROUVRE le dossier : il
 * repart du début du cycle (place si disponible, sinon liste d'attente), comme
 * une inscription neuve. Décision PO du 11/11/2026.
 */
export const STATUTS_REPRISE: readonly string[] = [
  COUREUR_STATUS_REFUSE,
  COUREUR_STATUS_EXPIREE,
];

/**
 * Statuts dans lesquels le coureur peut encore enregistrer sa saisie.
 *
 * « Validé » est figé pour de bon ; « en validation » l'est jusqu'à la
 * décision, sans exception — pas même la preuve (PO, 11/11/2026). Un
 * dossier en attente de place reste corrigeable — aucune raison de lui
 * interdire de corriger son téléphone. Un dossier refusé ou expiré l'est
 * aussi : l'enregistrer est justement ce qui le reprend (voir
 * STATUTS_REPRISE).
 */
export const STATUTS_MODIFIABLES: readonly string[] = [
  COUREUR_STATUS_EN_CONSTITUTION,
  COUREUR_STATUS_LISTE_ATTENTE,
  ...STATUTS_REPRISE,
];

export function estModifiable(status: string): boolean {
  return STATUTS_MODIFIABLES.includes(status);
}

export function estReprise(status: string): boolean {
  return STATUTS_REPRISE.includes(status);
}

/** Jamais négatif : une capacité abaissée sous le nombre d'inscrits donne 0. */
export function placesRestantes(capacite: number, occupees: number): number {
  return Math.max(0, capacite - occupees);
}

/**
 * Le compteur reste muet tant qu'il reste beaucoup de places — afficher
 * « 580 places restantes » le premier jour dit surtout que personne ne s'est
 * inscrit. Il sort au seuil, et « 0 place » s'affiche toujours : c'est une
 * information, pas un silence.
 */
export function doitAfficherPlaces(restantes: number, seuil: number): boolean {
  return restantes <= seuil;
}

/**
 * Statut d'une inscription qui arrive. Le nombre de places restantes DOIT
 * avoir été lu sous verrou dans la même transaction que l'écriture : lu avant,
 * deux coureurs obtiennent la même dernière place.
 */
export function statutInitial(restantes: number): string {
  return restantes > 0 ? COUREUR_STATUS_EN_CONSTITUTION : COUREUR_STATUS_LISTE_ATTENTE;
}

/**
 * Statut d'un dossier EXISTANT après « Modifier mon inscription ».
 *
 * - Figé (validé, en validation) : null — l'enregistrement est refusé.
 * - Refusé ou expiré : reprise, règle commune avec une inscription neuve —
 *   une place s'il en reste (en constitution), sinon la liste d'attente.
 * - En constitution, liste d'attente : inchangé. Corriger son téléphone ne
 *   doit ni coûter ni rapporter une place.
 *
 * Même exigence que statutInitial : `restantes` lu sous le verrou d'édition,
 * hors le dossier du coureur lui-même.
 */
export function statutApresModification(statutActuel: string, restantes: number): string | null {
  if (!estModifiable(statutActuel)) {
    return null;
  }
  return estReprise(statutActuel) ? statutInitial(restantes) : statutActuel;
}

/** Fuseau de la course : toutes les échéances se lisent à l'heure d'Alger. */
export const FUSEAU_COURSE = 'Africa/Algiers';

/**
 * Bornes du délai de dépôt de la preuve, en heures : une heure au moins,
 * trente jours au plus. Au-delà, ce serait une faute de frappe — et une place
 * bloquée un mois sans versement.
 */
export const DELAI_PREUVE_HEURES_MIN = 1;

export const DELAI_PREUVE_HEURES_MAX = 720;

/**
 * Variable d'environnement de DÉVELOPPEMENT : délai forcé, en minutes. Sert à
 * tester une expiration en local sans toucher à la base. Ignorée en
 * production (voir lireSurchargeDelaiPreuve).
 */
export const ENV_DELAI_PREUVE_MINUTES = 'AZZEL_DELAI_PREUVE_MINUTES';

/**
 * Environnements où la surcharge est permise : liste BLANCHE. Un script lancé
 * sans NODE_ENV (seed, seed:reset contre la recette depuis un poste dont le
 * .env porte la variable) ne doit pas poser des échéances à quelques minutes.
 */
const ENVIRONNEMENTS_SURCHARGE_DELAI: readonly string[] = ['development', 'test'];

/**
 * Surcharge de développement du délai de preuve, en minutes, ou null.
 *
 * Pure : reçoit la valeur brute de la variable et NODE_ENV, ne lit rien
 * elle-même. Prise en compte seulement si NODE_ENV vaut « development » ou
 * « test », et seulement si c'est un entier strictement positif, au plus le
 * délai maximal (720 h) — « abc », « 0 », « -3 », « 4.5 » ou une valeur
 * énorme (qui donnerait une date invalide) sont ignorés : on retombe alors
 * sur le délai réglé en administration.
 */
export function lireSurchargeDelaiPreuve(
  valeur: string | null | undefined,
  nodeEnv: string | null | undefined,
): number | null {
  if (
    nodeEnv === null ||
    nodeEnv === undefined ||
    !ENVIRONNEMENTS_SURCHARGE_DELAI.includes(nodeEnv) ||
    valeur === null ||
    valeur === undefined
  ) {
    return null;
  }
  const texte = valeur.trim();
  if (!/^\d+$/.test(texte)) {
    return null;
  }
  const minutes = Number(texte);
  return Number.isSafeInteger(minutes) && minutes > 0 && minutes <= DELAI_PREUVE_HEURES_MAX * 60
    ? minutes
    : null;
}

/**
 * Date limite de dépôt de la preuve : `debut` + le délai, en durée glissante
 * (décision PO du 13/11/2026). Formulaire envoyé le 13/11 à 10:05 avec 48 h →
 * 15/11 à 10:05. Aucun arrondi à la fin de journée : la réservation dure le
 * même temps pour tous, quelle que soit l'heure d'inscription.
 *
 * `debut` est l'entrée en « en constitution » (formulaire envoyé, reprise,
 * attribution depuis la liste d'attente), puis l'instant où le dossier
 * devient rempli (décharge et règlement acceptés) : l'échéance REDÉMARRE à
 * ce moment-là. Une correction de saisie, elle, ne la déplace jamais.
 *
 * `surchargeMinutes` (développement seulement, voir lireSurchargeDelaiPreuve)
 * remplace le délai en heures quand elle est fournie.
 */
export function limitePreuve(
  debut: Date,
  delaiHeures: number,
  surchargeMinutes?: number | null,
): Date {
  const minutes =
    surchargeMinutes !== null && surchargeMinutes !== undefined && surchargeMinutes > 0
      ? surchargeMinutes
      : delaiHeures * 60;
  return new Date(debut.getTime() + minutes * 60_000);
}

/**
 * La limite est INCLUSE : pile à l'échéance, le dossier est encore dans les
 * temps. Une limite absente ne fait jamais expirer — on ne libère pas une
 * place sur une donnée manquante.
 */
export function estExpiree(limite: Date | null, maintenant: Date): boolean {
  return limite !== null && maintenant.getTime() > limite.getTime();
}

/**
 * L'hébergement est une OPTION contingentée : souhaité mais complet, il est
 * simplement refusé — l'inscription, elle, passe. Refuser la course entière
 * pour un lit indisponible ferait perdre au coureur sa place de départ.
 */
export function hebergementAccorde(souhaite: boolean, restantes: number): boolean {
  return souhaite && restantes > 0;
}

/**
 * Montant total à verser, en dinars : le dossard, plus l'hébergement s'il est
 * accordé. Un seul versement, une seule preuve — deux justificatifs à suivre
 * doubleraient le travail de dépôt et de vérification.
 *
 * Les deux prix viennent de l'édition : ils sont provisoires et révisables en
 * administration, jamais écrits en dur.
 */
export function montantDuDa(
  prixDossardDa: number,
  prixHebergementDa: number,
  avecHebergement: boolean,
): number {
  return prixDossardDa + (avecHebergement ? prixHebergementDa : 0);
}

/**
 * Réglages d'édition modifiables en administration.
 *
 * Vit dans le domaine et non dans le service : l'écran d'administration est un
 * composant CLIENT, et importer une valeur depuis le service y tirerait le
 * store et le pilote Postgres dans le bundle du navigateur.
 */
export const CHAMPS_REGLAGES = [
  'capacite',
  'seuilAffichagePlaces',
  'capaciteHebergement',
  'prixDossardDa',
  'prixHebergementDa',
  'delaiPreuveHeures',
  'dateCoursePublique',
] as const;

/** Réglages qui sont un choix oui (1) / non (0), pas une quantité. */
export const REGLAGES_OUI_NON: readonly string[] = ['dateCoursePublique'];

export type ChampReglage = (typeof CHAMPS_REGLAGES)[number];

export const LIBELLES_REGLAGES: Record<ChampReglage, string> = {
  capacite: 'Nombre de dossards',
  seuilAffichagePlaces: 'Seuil d’affichage du compteur',
  capaciteHebergement: 'Nombre d’hébergements',
  prixDossardDa: 'Prix du dossard (DA)',
  prixHebergementDa: 'Prix de l’hébergement (DA)',
  delaiPreuveHeures: 'Délai de dépôt de la preuve (heures)',
  dateCoursePublique: 'Afficher la date exacte de la course au public',
};

/**
 * Bornes propres à certains réglages, plus serrées que le garde-fou commun
 * (entier positif, plafond de saisie). Le formulaire les reprend en min/max,
 * le service les impose, la base les vérifie (CHECK de la migration 0045).
 */
export const BORNES_REGLAGES: Partial<
  Record<ChampReglage, { min: number; max: number; message: string }>
> = {
  delaiPreuveHeures: {
    min: DELAI_PREUVE_HEURES_MIN,
    max: DELAI_PREUVE_HEURES_MAX,
    message: `Indique un délai entre ${DELAI_PREUVE_HEURES_MIN} et ${DELAI_PREUVE_HEURES_MAX} heures (30 jours).`,
  },
};

/**
 * Libellés de l'historique des réglages : ceux d'aujourd'hui, plus ceux des
 * champs retirés dont des lignes subsistent. Le délai s'est réglé en jours
 * jusqu'à la migration 0045 : ces lignes restent lisibles telles quelles,
 * leurs valeurs ne sont PAS converties — « 2 → 3 » y reste des jours.
 */
export const LIBELLES_JOURNAL_REGLAGES: Readonly<Record<string, string>> = {
  ...LIBELLES_REGLAGES,
  delaiPreuveJours: 'Délai de dépôt de la preuve (jours, ancien réglage)',
};

export type CoureurStatus = (typeof COUREUR_STATUSES)[number];

export const COUREUR_STATUS_LABELS: Record<CoureurStatus, string> = {
  [COUREUR_STATUS_EN_CONSTITUTION]: 'En constitution',
  [COUREUR_STATUS_EN_VALIDATION]: 'En validation',
  [COUREUR_STATUS_VALIDE]: 'Validé',
  [COUREUR_STATUS_REFUSE]: 'Refusé',
  [COUREUR_STATUS_LISTE_ATTENTE]: 'Liste d’attente',
  [COUREUR_STATUS_EXPIREE]: 'Expirée',
};

/** M2 (revue épopée 10) — limite de la liste admin, vit ICI (domaine pur)
 *  pour que la page et les messages qui l'énoncent importent la CONSTANTE,
 *  jamais un littéral « 200 » qui dériverait. */
export const LIST_COUREURS_LIMIT = 200;

/** Story 10.3 / I9 (revue épopée 10) — pastille d'état du gabarit socle :
 *  le point porte la couleur, le libellé porte le sens (jamais la couleur
 *  seule). Partagée par la liste ET la page détail — un seul langage visuel
 *  par statut (remplace l'ancien vocabulaire aa-chip). */
export const PASTILLE_STATUT: Record<CoureurStatus, string> = {
  [COUREUR_STATUS_EN_CONSTITUTION]: 'socle-pastille--attention',
  // La balle est dans le camp de l'organisation : registre de l'attente, pas
  // celui d'une action à faire par le coureur.
  [COUREUR_STATUS_EN_VALIDATION]: 'socle-pastille--sync-attente',
  [COUREUR_STATUS_VALIDE]: 'socle-pastille--succes',
  [COUREUR_STATUS_REFUSE]: 'socle-pastille--danger',
  // En attente d'une place : ni acquis, ni refusé — le même langage visuel que
  // l'attente de synchronisation, pas celui d'un problème à corriger.
  [COUREUR_STATUS_LISTE_ATTENTE]: 'socle-pastille--sync-attente',
  // Expirée faute de preuve : un fait, pas une faute de l'organisation ni un
  // refus motivé — le même registre neutre que l'attente.
  [COUREUR_STATUS_EXPIREE]: 'socle-pastille--sync-attente',
};

export interface DateCourseAffichee {
  /** « printemps 2027 » ou « 26 mars 2027 » : utilisable seul (étiquette, rail). */
  libelle: string;
  /** « au printemps 2027 » ou « le 26 mars 2027 » : utilisable dans une phrase. */
  phrase: string;
}

type Saison = 'printemps' | 'été' | 'automne' | 'hiver';

const PREPOSITION_SAISON: Record<Saison, string> = {
  printemps: 'au',
  été: 'en',
  automne: 'en',
  hiver: 'en',
};

/** Saison astronomique approchée : 20 mars, 21 juin, 23 septembre, 21 décembre. */
function saisonDe(mois: number, jour: number): Saison {
  const quantieme = mois * 100 + jour;
  if (quantieme >= 320 && quantieme <= 620) {
    return 'printemps';
  }
  if (quantieme >= 621 && quantieme <= 922) {
    return 'été';
  }
  if (quantieme >= 923 && quantieme <= 1220) {
    return 'automne';
  }
  return 'hiver';
}

/**
 * Date de course telle que le public la lit.
 *
 * La date réelle reste en base, exacte, parce que tout en dépend (âge à la
 * course, ordre des éditions, chronométrage). Seul son AFFICHAGE est pilotable :
 * tant que l'organisation ne l'a pas annoncée, le public ne lit que la saison,
 * calculée depuis la vraie date — « printemps » écrit en dur deviendrait faux
 * en silence si la course passait à l'automne.
 */
export function dateCourseAffichee(raceDate: string, publique: boolean): DateCourseAffichee {
  const iso = parseIsoDate(raceDate);
  if (iso === null) {
    return { libelle: 'prochainement', phrase: 'prochainement' };
  }
  if (publique) {
    const lisible = formatDateFrUtc(`${iso}T00:00:00Z`);
    return { libelle: lisible, phrase: `le ${lisible}` };
  }
  const [annee, mois, jour] = iso.split('-').map(Number) as [number, number, number];
  const saison = saisonDe(mois, jour);
  return {
    libelle: `${saison} ${annee}`,
    phrase: `${PREPOSITION_SAISON[saison]} ${saison} ${annee}`,
  };
}

/**
 * Épreuve et distance, sans doublon : les noms seedés portent déjà la distance
 * (« La Longue — 35 km »), et la répéter donnait « La Longue — 35 km (35 km) ».
 * Le garde-fou évite de confondre « 135 km » avec « 35 km ».
 */
export function libelleEpreuve(nom: string, distanceKm: number): string {
  const distance = String(distanceKm);
  const dejaDit = new RegExp(`(?<![\\d.])${distance.replace('.', '\\.')}\\s*km`, 'i');
  return dejaDit.test(nom) ? nom : `${nom} (${distance} km)`;
}

export const LIBELLE_ATTENTE_JUSTIFICATIF = 'En attente de justificatif de paiement';

export const LIBELLE_ATTENTE_VALIDATION = 'En attente de validation par l’organisation';

export interface StatutAffiche {
  libelle: string;
  /** Classe de pastille du socle : le point porte la couleur, le libellé le sens. */
  pastille: string;
}

/**
 * Statut tel que le lisent le coureur et l'organisation.
 *
 * Les deux attentes se disent par QUI doit agir : « en constitution », c'est
 * au coureur (verser, déposer son justificatif) ; « en validation », c'est à
 * l'organisation. Les autres statuts se lisent tels quels.
 */
export function statutAffiche(status: string): StatutAffiche {
  if (status === COUREUR_STATUS_EN_CONSTITUTION) {
    return { libelle: LIBELLE_ATTENTE_JUSTIFICATIF, pastille: PASTILLE_STATUT[status] };
  }
  if (status === COUREUR_STATUS_EN_VALIDATION) {
    return { libelle: LIBELLE_ATTENTE_VALIDATION, pastille: PASTILLE_STATUT[status] };
  }
  const connu = status as CoureurStatus;
  return {
    libelle: COUREUR_STATUS_LABELS[connu] ?? status,
    pastille: PASTILLE_STATUT[connu] ?? '',
  };
}

/**
 * Dépôt de la preuve : en constitution seulement ; le dépôt fait passer le
 * dossier en validation. En validation, le dossier est figé jusqu'à la
 * décision : aucun remplacement (PO, 11/11/2026) — l'organisateur ne doit
 * jamais valider une preuve qu'il n'a pas vue. Un coureur qui s'est trompé de
 * fichier appelle l'organisation, qui refuse le dossier. Refusé ou expiré : le
 * dossier doit d'abord être repris par « Modifier mon inscription ».
 */
export function canDepositPreuve(status: string): boolean {
  return status === COUREUR_STATUS_EN_CONSTITUTION;
}

/**
 * Acceptation de la décharge et du règlement : en constitution seulement.
 * Elles sont exigées AVANT le dépôt de la preuve (PO, 11/11/2026) ; en
 * validation, le dossier est figé et aucune acceptation n'est possible.
 */
export function peutAccepterDocuments(status: string): boolean {
  return status === COUREUR_STATUS_EN_CONSTITUTION;
}

export const MAX_REFUSAL_REASON_LENGTH = 280;

export function normalizeRefusalReason(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim();
}

export const DOCUMENT_SLUGS = ['decharge', 'reglement'] as const;

export type DocumentSlug = (typeof DOCUMENT_SLUGS)[number];

export const DOCUMENT_TITLES: Record<DocumentSlug, string> = {
  decharge: 'Décharge de bonne santé',
  reglement: 'Règlement intérieur',
};

export function documentTitle(slug: string): string {
  return DOCUMENT_TITLES[slug as DocumentSlug] ?? 'Document officiel';
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface InscriptionFormInput {
  epreuve: string;
  prenom: string;
  nom: string;
  telephone: string;
  contactUrgenceNom: string;
  contactUrgenceTelephone: string;
  dateNaissance: string;
  tailleTshirt: string;
  genre: string;
  /** Code de wilaya à deux chiffres ('15'), ou 'ETR' pour l'étranger. */
  wilaya: string;
  /** Code ISO 3166-1 alpha-2 ('FR'), exigé si et seulement si wilaya = 'ETR'. */
  pays: string;
  /** « oui » si le coureur demande un hébergement ; toute autre valeur = non. */
  hebergement: string;
}

export type FieldErrors = Partial<Record<keyof InscriptionFormInput, string>>;

export const FIELD_ORDER: readonly (keyof InscriptionFormInput)[] = [
  'epreuve',
  'prenom',
  'nom',
  'dateNaissance',
  'telephone',
  'wilaya',
  'pays',
  'contactUrgenceNom',
  'contactUrgenceTelephone',
  'tailleTshirt',
  'genre',
  // L'hébergement est facultatif, mais il PEUT être refusé (Tizi Ouzou) :
  // sans lui dans l'ordre, le focus d'erreur l'ignorerait.
  'hebergement',
];

/** Message unique de la règle « hébergement hors Tizi Ouzou » : client, serveur, tests. */
export const MESSAGE_HEBERGEMENT_TIZI_OUZOU =
  'L’hébergement est réservé aux participants venant d’une autre wilaya que Tizi Ouzou.';

/** L'hébergement est-il ouvert à cette provenance ? Une provenance inconnue ne ferme rien. */
export function hebergementOuvertA(wilaya: string): boolean {
  return wilaya !== WILAYA_TIZI_OUZOU;
}

/**
 * Saisie après le choix d'une wilaya, côté formulaire.
 *
 * Tizi Ouzou décoche l'hébergement : la case est alors désactivée, et un
 * coureur qui ne peut plus la décocher lui-même enverrait une demande que le
 * serveur refuserait. Hors étranger, le pays n'a plus de sens et s'efface.
 */
export function choisirWilaya(
  input: InscriptionFormInput,
  wilaya: string,
): InscriptionFormInput {
  return {
    ...input,
    wilaya,
    pays: wilaya === WILAYA_ETRANGER ? input.pays : '',
    hebergement: hebergementOuvertA(wilaya) ? input.hebergement : '',
  };
}

export function parseIsoDate(value: string): string | null {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export function completedYearsAt(birthDate: string, onDate: string): number | null {
  const birth = parseIsoDate(birthDate);
  const on = parseIsoDate(onDate);
  if (birth === null || on === null) {
    return null;
  }
  const [birthYear, birthMonth, birthDay] = birth
    .split('-')
    .map(Number) as [number, number, number];
  const [onYear, onMonth, onDay] = on.split('-').map(Number) as [number, number, number];
  let age = onYear - birthYear;
  if (onMonth < birthMonth || (onMonth === birthMonth && onDay < birthDay)) {
    age -= 1;
  }
  return age;
}

export function ageCategoryFor(age: number): AgeCategory {
  if (age < 40) {
    return 'Senior';
  }
  if (age < 50) {
    return 'V1';
  }
  if (age < 60) {
    return 'V2';
  }
  return 'V3';
}

export function deriveAgeAndCategory(
  birthDate: string,
  raceDate: string,
): { age: number; category: AgeCategory } | null {
  const age = completedYearsAt(birthDate, raceDate);
  if (age === null) {
    return null;
  }
  return { age, category: ageCategoryFor(age) };
}

export function isRegistrationOpen(registrationClosesAt: Date, now: Date = new Date()): boolean {
  return now.getTime() < registrationClosesAt.getTime();
}

export function formatDateFrUtc(isoUtc: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(isoUtc),
  );
}

export function normalizePhone(value: string): string {
  return value.replace(/[\s().-]/g, '');
}

export function isValidPhone(value: string): boolean {
  return /^\+?\d{6,15}$/.test(normalizePhone(value));
}

export function normalizeInscriptionInput(raw: unknown): InscriptionFormInput {
  const record =
    typeof raw === 'object' && raw !== null
      ? (raw as Partial<Record<keyof InscriptionFormInput, unknown>>)
      : {};
  const text = (key: keyof InscriptionFormInput): string => {
    const value = record[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  return {
    epreuve: text('epreuve'),
    prenom: text('prenom'),
    nom: text('nom'),
    telephone: normalizePhone(text('telephone')),
    contactUrgenceNom: text('contactUrgenceNom'),
    contactUrgenceTelephone: normalizePhone(text('contactUrgenceTelephone')),
    dateNaissance: text('dateNaissance'),
    tailleTshirt: text('tailleTshirt'),
    // Majusculeé sans être filtré : une valeur hors liste doit arriver
    // jusqu'à la validation, qui la nomme, plutôt que d'être effacée ici et
    // de ressortir en « champ obligatoire » trompeur.
    genre: text('genre').toUpperCase(),
    // Même principe : « etr » ou « fr » passent, une valeur inconnue arrive
    // jusqu'à la validation qui la refuse en la nommant.
    wilaya: text('wilaya').toUpperCase(),
    pays: text('pays').toUpperCase(),
    // Case à cocher : seule « oui » vaut demande. Rien à valider — une valeur
    // inattendue signifie simplement que la case n'était pas cochée.
    hebergement: text('hebergement').toLowerCase() === 'oui' ? 'oui' : '',
  };
}

function humanList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values.join('');
  }
  return `${values.slice(0, -1).join(', ')} ou ${values[values.length - 1] ?? ''}`;
}

export function validateInscriptionInput(
  input: InscriptionFormInput,
  epreuveSlugs: readonly string[],
  raceDate: string,
  today: Date = new Date(),
): FieldErrors {
  const errors: FieldErrors = {};

  if (!epreuveSlugs.includes(input.epreuve)) {
    errors.epreuve =
      input.epreuve === ''
        ? 'Choisis ton épreuve.'
        : epreuveSlugs.length === 0
          ? 'Aucune épreuve n’est disponible pour cette édition.'
          : `Épreuve inconnue : choisis ${humanList(epreuveSlugs)}.`;
  }

  if (input.prenom === '') {
    errors.prenom = 'Ton prénom est obligatoire.';
  } else if (input.prenom.length > 80) {
    errors.prenom = '80 caractères maximum pour le prénom.';
  }

  if (input.nom === '') {
    errors.nom = 'Ton nom est obligatoire.';
  } else if (input.nom.length > 80) {
    errors.nom = '80 caractères maximum pour le nom.';
  }

  if (input.telephone === '') {
    errors.telephone = 'Ton numéro de téléphone est obligatoire.';
  } else if (!isValidPhone(input.telephone)) {
    errors.telephone = 'Ce numéro de téléphone ne semble pas valide.';
  }

  if (input.contactUrgenceNom === '') {
    errors.contactUrgenceNom = 'Le nom de ton contact d’urgence est obligatoire.';
  } else if (input.contactUrgenceNom.length > 80) {
    errors.contactUrgenceNom = '80 caractères maximum pour le nom du contact d’urgence.';
  }

  if (input.contactUrgenceTelephone === '') {
    errors.contactUrgenceTelephone = 'Le numéro de ton contact d’urgence est obligatoire.';
  } else if (!isValidPhone(input.contactUrgenceTelephone)) {
    errors.contactUrgenceTelephone = 'Ce numéro d’urgence ne semble pas valide.';
  }

  if (input.dateNaissance === '') {
    errors.dateNaissance = 'Ta date de naissance est obligatoire.';
  } else if (parseIsoDate(input.dateNaissance) === null) {
    errors.dateNaissance = 'Date de naissance invalide.';
  } else if (input.dateNaissance > today.toISOString().slice(0, 10)) {
    errors.dateNaissance = 'Ta date de naissance ne peut pas être dans le futur.';
  } else {
    const age = completedYearsAt(input.dateNaissance, raceDate);
    if (age === null) {
      errors.dateNaissance = 'Date de naissance invalide.';
    } else if (age < MIN_AGE_AT_RACE) {
      errors.dateNaissance = `Les épreuves sont réservées aux majeurs : tu dois avoir ${MIN_AGE_AT_RACE} ans révolus le jour de la course.`;
    } else if (age > MAX_AGE_AT_RACE) {
      errors.dateNaissance = `Tu dois avoir entre ${MIN_AGE_AT_RACE} et ${MAX_AGE_AT_RACE} ans à la date de la course.`;
    }
  }

  if (!(TSHIRT_SIZES as readonly string[]).includes(input.tailleTshirt)) {
    errors.tailleTshirt = 'Choisis ta taille de t-shirt.';
  }

  if (!(GENRES as readonly string[]).includes(input.genre)) {
    errors.genre = 'Indique si tu cours en femme ou en homme.';
  }

  if (!estProvenanceValide(input.wilaya)) {
    errors.wilaya = 'Choisis ta wilaya, ou « Étranger ».';
  } else if (input.wilaya === WILAYA_ETRANGER && !estPaysValide(input.pays)) {
    // L'Algérie n'est pas dans la liste : un résident choisit sa wilaya.
    errors.pays = 'Indique ton pays de résidence.';
  }

  // Erreur NOMMÉE, jamais une correction silencieuse : décocher à la place du
  // coureur lui ferait payer moins que ce qu'il croit avoir demandé.
  if (input.hebergement === 'oui' && !hebergementOuvertA(input.wilaya)) {
    errors.hebergement = MESSAGE_HEBERGEMENT_TIZI_OUZOU;
  }

  return errors;
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}
