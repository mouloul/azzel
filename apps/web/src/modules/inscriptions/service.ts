import type { SessionRecord } from '@/modules/iam/store';
import { processOutbox, type OutboxProcessSummary } from '@/modules/notifications/worker';

// Story 6.1 — les contrats dossier/e-dossard vivent dans @azzel/shared
// (consommés tels quels par l'app native) : réexportés ici pour les pages.
import type {
  ChecklistPiece,
  ChecklistPieceId,
  ChecklistRecap,
  ChecklistState,
  EditionSummary,
  EdossardState,
} from '@azzel/shared';

import {
  AGE_CATEGORY_LABELS,
  COUREUR_STATUS_EN_VALIDATION,
  COUREUR_STATUS_EXPIREE,
  COUREUR_STATUS_LISTE_ATTENTE,
  COUREUR_STATUS_REFUSE,
  COUREUR_STATUS_VALIDE,
  BORNES_REGLAGES,
  CHAMPS_REGLAGES,
  dateCourseAffichee,
  type DateCourseAffichee,
  REGLAGES_OUI_NON,
  LIBELLES_JOURNAL_REGLAGES,
  canDepositPreuve,
  estModifiable,
  peutAccepterDocuments,
  type ChampReglage,
  doitAfficherPlaces,
  montantDuDa,
  placesRestantes,
  deriveAgeAndCategory,
  documentTitle,
  hasFieldErrors,
  isRegistrationOpen,
  normalizeInscriptionInput,
  normalizeRefusalReason,
  validateInscriptionInput,
  MAX_REFUSAL_REASON_LENGTH,
  type AgeCategory,
} from './domain';
import {
  BothAcceptancesRequiredError,
  DecisionInvalidError,
  InvalidFieldsError,
  NoEditionError,
  RefusalReasonRequiredError,
  RefusalReasonTooLongError,
  RegistrationClosedError,
  ReglagesInvalidesError,
} from './errors';
import {
  getInscriptionsStore,
  type CoureurRecord,
  type DossierDecision,
  type DossierListItem,
  type DossardsAttribution as DossardsAttributionStore,
  type ComptesPaiement,
  type EditionRecord,
  type EpreuveRecord,
  type InscriptionsStore,
  type ReglagesEdition,
  type ResultatAttribution,
  surchargeDelaiPreuveMinutes,
} from './store';

export interface CoureurSummary {
  id: string;
  epreuve: string;
  epreuveNom: string;
  distanceKm: number;
  prenom: string;
  nom: string;
  telephone: string;
  contactUrgenceNom: string;
  contactUrgenceTelephone: string;
  dateNaissance: string;
  tailleTshirt: string;
  genre: string | null;
  /** Code de wilaya ('15') ou 'ETR' ; null pour un dossier antérieur à la question. */
  wilaya: string | null;
  /** Code ISO du pays de résidence, seulement pour 'ETR'. */
  pays: string | null;
  /** ISO, ou null si aucune échéance (liste d'attente). */
  preuveDueAt: string | null;
  hebergement: boolean;
  age: number;
  categorie: AgeCategory;
  status: string;
  dossard: number | null;
  refusalReason: string | null;
  dechargeAccepte: { acceptedAt: string; version: string } | null;
  reglementAccepte: { acceptedAt: string; version: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type {
  ChecklistPiece,
  ChecklistPieceId,
  ChecklistRecap,
  ChecklistState,
  EditionSummary,
} from '@azzel/shared';

export interface EpreuveSummary {
  id: string;
  slug: string;
  nom: string;
  distanceKm: number;
}

export interface InscriptionState {
  edition: EditionSummary | null;
  epreuves: EpreuveSummary[];
  coureur: CoureurSummary | null;
}

export interface InscriptionsServiceDeps {
  store?: InscriptionsStore;
  triggerOutbox?: (limit?: number) => Promise<OutboxProcessSummary | void>;
}

// Envoi best effort post-événement : jamais bloquant pour le parcours coureur
// (FR-6) — erreurs avalées + log, le rejeu repasse par emails:send.
function notifyOutbox(deps: InscriptionsServiceDeps): void {
  const trigger = deps.triggerOutbox ?? processOutbox;
  void (async () => {
    try {
      await trigger();
    } catch (error) {
      console.error('[notifications] envoi best effort après événement a échoué :', error);
    }
  })();
}

function acceptanceSummary(
  acceptedAt: Date | null,
  version: string | null,
): { acceptedAt: string; version: string } | null {
  if (acceptedAt === null || version === null) {
    return null;
  }
  return { acceptedAt: acceptedAt.toISOString(), version };
}

function toCoureurSummary(record: CoureurRecord): CoureurSummary {
  return {
    id: record.id,
    epreuve: record.epreuveSlug,
    epreuveNom: record.epreuveNom,
    distanceKm: record.distanceKm,
    prenom: record.prenom,
    nom: record.nom,
    telephone: record.telephone,
    contactUrgenceNom: record.contactUrgenceNom,
    contactUrgenceTelephone: record.contactUrgenceTelephone,
    dateNaissance: record.dateNaissance,
    tailleTshirt: record.tailleTshirt,
    genre: record.genre,
    wilaya: record.wilaya,
    pays: record.pays,
    preuveDueAt: record.preuveDueAt?.toISOString() ?? null,
    hebergement: record.hebergement,
    age: record.age,
    categorie: record.categorieAge as AgeCategory,
    status: record.status,
    dossard: record.dossard,
    refusalReason: record.refusalReason,
    dechargeAccepte: acceptanceSummary(record.dechargeAcceptedAt, record.dechargeVersion),
    reglementAccepte: acceptanceSummary(record.reglementAcceptedAt, record.reglementVersion),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toEditionSummary(edition: EditionRecord): EditionSummary {
  const dateAffichee = dateCourseAffichee(edition.dateCourse, edition.dateCoursePublique);
  return {
    id: edition.id,
    slug: edition.slug,
    nom: edition.nom,
    dateCourse: edition.dateCourse,
    dateCourseLibelle: dateAffichee.libelle,
    dateCoursePhrase: dateAffichee.phrase,
    registrationClosesAt: edition.registrationClosesAt.toISOString(),
    registrationOpen: isRegistrationOpen(edition.registrationClosesAt),
  };
}

function toEpreuveSummary(epreuve: EpreuveRecord): EpreuveSummary {
  return {
    id: epreuve.id,
    slug: epreuve.slug,
    nom: epreuve.nom,
    distanceKm: epreuve.distanceKm,
  };
}

/**
 * État du contingent, pour le compteur public.
 *
 * Ne lève JAMAIS : un compteur est un agrément. Qu'il manque parce que la base
 * est indisponible ne doit empêcher personne de s'inscrire, ni faire tomber
 * l'accueil — dans ce cas il se tait, et la page vaut ce qu'elle valait avant
 * qu'il existe.
 */
export interface PlacesState {
  capacite: number;
  restantes: number;
  /** Le compteur ne sort qu'au seuil : voir doitAfficherPlaces. */
  afficher: boolean;
  complet: boolean;
}

export const PLACES_MUETTES: PlacesState = {
  capacite: 0,
  restantes: 0,
  afficher: false,
  complet: false,
};

/**
 * Variante vitrine : aucune session, donc aucune organisation en contexte.
 * Même contrat de silence en cas de panne.
 */
/**
 * Date de course telle que la vitrine la lit, sans session.
 *
 * Ne lève JAMAIS, et son repli est le plus discret : « prochainement ». Si la
 * base ne répond pas, on ne sait pas si l'organisation a publié la date — on
 * n'en dit donc rien, plutôt que de risquer de la divulguer.
 */
export async function getDateCourseVitrine(
  deps: InscriptionsServiceDeps = {},
): Promise<DateCourseAffichee> {
  const store = deps.store ?? getInscriptionsStore();
  try {
    const date = await store.readDefaultOrgDateCourse();
    if (!date) {
      return DATE_COURSE_INCONNUE;
    }
    return dateCourseAffichee(date.raceDate, date.publique);
  } catch (error) {
    console.warn(
      '[vitrine] date de course indisponible :',
      error instanceof Error ? error.message : error,
    );
    return DATE_COURSE_INCONNUE;
  }
}

export const DATE_COURSE_INCONNUE: DateCourseAffichee = {
  libelle: 'prochainement',
  phrase: 'prochainement',
};

export async function getPlacesVitrine(
  deps: InscriptionsServiceDeps = {},
): Promise<PlacesState> {
  const store = deps.store ?? getInscriptionsStore();
  try {
    const places = await store.readDefaultOrgPlaces();
    if (!places) {
      return PLACES_MUETTES;
    }
    const restantes = placesRestantes(places.capacite, places.occupees);
    return {
      capacite: places.capacite,
      restantes,
      afficher: doitAfficherPlaces(restantes, places.seuil),
      complet: restantes === 0,
    };
  } catch (error) {
    console.warn(
      '[vitrine] compteur de places indisponible :',
      error instanceof Error ? error.message : error,
    );
    return PLACES_MUETTES;
  }
}

/**
 * Contingent d'hébergement, pour le formulaire.
 *
 * Contrairement au compteur de dossards, celui-ci s'affiche TOUJOURS : deux
 * cents lits se remplissent vite, et le coureur doit pouvoir décider en
 * sachant combien il en reste.
 */
export interface HebergementState {
  restantes: number;
  capacite: number;
  complet: boolean;
  prixDa: number;
}

export const HEBERGEMENT_INDISPONIBLE: HebergementState = {
  restantes: 0,
  capacite: 0,
  complet: true,
  prixDa: 0,
};

/**
 * Ce que le coureur doit verser : dossard, plus hébergement s'il l'a obtenu.
 * Un seul montant, un seul versement, une seule preuve.
 *
 * Null quand le montant ne peut pas être établi (pas d'édition, pas de
 * dossier, base muette) : mieux vaut ne rien annoncer qu'un chiffre faux, sur
 * lequel quelqu'un ferait un virement.
 */
export interface MontantDuState {
  totalDa: number;
  prixDossardDa: number;
  prixHebergementDa: number;
  avecHebergement: boolean;
}

export async function getMontantDu(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<MontantDuState | null> {
  const store = deps.store ?? getInscriptionsStore();
  try {
    const edition = await store.findCurrentEdition(session.organisationId);
    if (!edition) {
      return null;
    }
    const coureur = await store.findCoureurByAccount(
      session.accountId,
      edition.id,
      session.organisationId,
    );
    if (!coureur) {
      return null;
    }
    return {
      totalDa: montantDuDa(
        edition.prixDossardDa,
        edition.prixHebergementDa,
        coureur.hebergement,
      ),
      prixDossardDa: edition.prixDossardDa,
      prixHebergementDa: edition.prixHebergementDa,
      avecHebergement: coureur.hebergement,
    };
  } catch (error) {
    console.warn(
      '[inscriptions] montant dû indisponible :',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Bornes des réglages : un garde-fou de saisie, pas une règle métier. */
const REGLAGE_MAX = 100_000;

export interface ReglagesAdminState {
  edition: { id: string; nom: string } | null;
  comptesPaiement: ComptesPaiement;
  reglages: Record<ChampReglage, number>;
  /**
   * Délai de preuve forcé en minutes par AZZEL_DELAI_PREUVE_MINUTES
   * (développement seulement) ; null = le réglage en heures s'applique.
   */
  surchargeDelaiPreuveMinutes: number | null;
  placesOccupees: number;
  hebergementsOccupes: number;
  attente: CoureurEnAttenteView[];
  journal: LigneJournalView[];
}

export interface CoureurEnAttenteView {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  epreuveNom: string;
  hebergement: boolean;
  inscritLe: string;
}

export interface LigneJournalView {
  champ: string;
  libelle: string;
  ancienneValeur: number;
  nouvelleValeur: number;
  modifieLe: string;
  modifiePar: string | null;
}

const JOURNAL_LIMITE = 50;

const COMPTES_VIDES: ComptesPaiement = {
  ccp: null,
  titulaireCcp: null,
  baridimob: null,
  titulaireBaridimob: null,
};

/** Garde-fou de saisie : un numéro de compte ou un nom tient en quelques dizaines de caractères. */
const COMPTE_MAX = 80;

/**
 * Comptes de versement : texte libre, facultatif. Vide = non renseigné (le
 * coureur ne voit pas la ligne). Rien d'autre n'est imposé : un RIP Baridimob
 * et un CCP n'ont pas le même format, et une règle trop stricte bloquerait
 * l'organisation sur un compte valide.
 */
export function normaliserComptesPaiement(raw: unknown): {
  comptes: ComptesPaiement;
  erreurs: Record<string, string>;
} {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const comptes: ComptesPaiement = { ...COMPTES_VIDES };
  const erreurs: Record<string, string> = {};
  for (const champ of ['ccp', 'titulaireCcp', 'baridimob', 'titulaireBaridimob'] as const) {
    const brut = record[champ];
    if (brut === undefined || brut === null) {
      continue;
    }
    if (typeof brut !== 'string') {
      erreurs[champ] = 'Indique un texte.';
      continue;
    }
    const valeur = brut.trim().replace(/\s+/g, ' ');
    if (valeur.length > COMPTE_MAX) {
      erreurs[champ] = `${COMPTE_MAX} caractères au maximum.`;
      continue;
    }
    comptes[champ] = valeur === '' ? null : valeur;
  }
  return { comptes, erreurs };
}

export async function updateComptesPaiementAdmin(
  session: SessionRecord,
  raw: unknown,
  deps: InscriptionsServiceDeps = {},
): Promise<ReglagesAdminState> {
  const store = deps.store ?? getInscriptionsStore();
  const { comptes, erreurs } = normaliserComptesPaiement(raw);
  if (Object.keys(erreurs).length > 0) {
    throw new ReglagesInvalidesError(erreurs);
  }
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new Error('Aucune édition configurée : exécute pnpm -F @azzel/web db:migrate');
  }
  await store.updateComptesPaiement({
    organisationId: session.organisationId,
    editionId: edition.id,
    comptes,
  });
  return getReglagesAdmin(session, deps);
}

/** Comptes à afficher au coureur ; null si aucun n'est renseigné ou illisible. */
export async function getComptesPaiement(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<ComptesPaiement | null> {
  const store = deps.store ?? getInscriptionsStore();
  try {
    const edition = await store.findCurrentEdition(session.organisationId);
    const comptes = edition?.comptesPaiement;
    return comptes && (comptes.ccp !== null || comptes.baridimob !== null) ? comptes : null;
  } catch (error) {
    console.warn(
      '[inscriptions] comptes de paiement indisponibles :',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function getReglagesAdmin(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<ReglagesAdminState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return {
      edition: null,
      comptesPaiement: COMPTES_VIDES,
      reglages: {
        capacite: 0,
        seuilAffichagePlaces: 0,
        capaciteHebergement: 0,
        prixDossardDa: 0,
        prixHebergementDa: 0,
        delaiPreuveHeures: 0,
        dateCoursePublique: 0,
      },
      surchargeDelaiPreuveMinutes: surchargeDelaiPreuveMinutes(),
      placesOccupees: 0,
      hebergementsOccupes: 0,
      attente: [],
      journal: [],
    };
  }
  const [placesOccupees, hebergementsOccupes, attente, journal] = await Promise.all([
    store.countPlacesOccupees(edition.id, session.organisationId),
    store.countHebergementsOccupes(edition.id, session.organisationId),
    store.listListeAttente(edition.id, session.organisationId),
    store.listJournalReglages(edition.id, session.organisationId, JOURNAL_LIMITE),
  ]);
  return {
    edition: { id: edition.id, nom: edition.nom },
    comptesPaiement: edition.comptesPaiement ?? COMPTES_VIDES,
    reglages: {
      capacite: edition.capacite,
      seuilAffichagePlaces: edition.seuilAffichagePlaces,
      capaciteHebergement: edition.capaciteHebergement,
      prixDossardDa: edition.prixDossardDa,
      prixHebergementDa: edition.prixHebergementDa,
      delaiPreuveHeures: edition.delaiPreuveHeures,
      dateCoursePublique: edition.dateCoursePublique ? 1 : 0,
    },
    surchargeDelaiPreuveMinutes: surchargeDelaiPreuveMinutes(),
    placesOccupees,
    hebergementsOccupes,
    attente: attente.map((coureur) => ({
      ...coureur,
      inscritLe: coureur.inscritLe.toISOString(),
    })),
    journal: journal.map((ligne) => ({
      champ: ligne.champ,
      // Dictionnaire de l'historique, pas des réglages actuels : une ligne
      // « delaiPreuveJours » d'avant la migration 0045 garde un libellé qui
      // dit son unité, et ses valeurs ne sont pas converties.
      libelle: LIBELLES_JOURNAL_REGLAGES[ligne.champ] ?? ligne.champ,
      ancienneValeur: ligne.ancienneValeur,
      nouvelleValeur: ligne.nouvelleValeur,
      modifieLe: ligne.modifieLe.toISOString(),
      modifiePar: ligne.modifiePar,
    })),
  };
}

/**
 * Validation des réglages : entiers positifs et bornés. Une capacité à
 * 1 000 000 serait une faute de frappe, pas une décision — et elle rendrait
 * le compteur absurde pour tout le monde. Certains réglages ont des bornes
 * plus serrées (BORNES_REGLAGES : le délai de preuve, de 1 à 720 heures),
 * refusées avec une erreur nommée sur le champ.
 */
export function normaliserReglages(raw: unknown): {
  reglages: ReglagesEdition;
  erreurs: Partial<Record<ChampReglage, string>>;
} {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const reglages: ReglagesEdition = {};
  const erreurs: Partial<Record<ChampReglage, string>> = {};
  for (const champ of CHAMPS_REGLAGES) {
    const brut = record[champ];
    if (brut === undefined || brut === null || brut === '') {
      continue;
    }
    const valeur = Number(brut);
    // Un choix oui / non n'est pas une quantité : 2 ou 600 passeraient comme
    // entiers positifs ordinaires et seraient écrits tels quels.
    if (REGLAGES_OUI_NON.includes(champ)) {
      if (valeur !== 0 && valeur !== 1) {
        erreurs[champ] = 'Choisis oui ou non.';
        continue;
      }
      reglages[champ] = valeur;
      continue;
    }
    // Bornes propres au champ d'abord : -3, 1,5 ou 100 001 heures reçoivent
    // le message qui donne la plage du délai, pas un garde-fou générique.
    const bornes = BORNES_REGLAGES[champ];
    if (bornes !== undefined) {
      if (!Number.isInteger(valeur) || valeur < bornes.min || valeur > bornes.max) {
        erreurs[champ] = bornes.message;
        continue;
      }
      reglages[champ] = valeur;
      continue;
    }
    if (!Number.isInteger(valeur) || valeur < 0) {
      erreurs[champ] = 'Indique un nombre entier positif.';
      continue;
    }
    if (valeur > REGLAGE_MAX) {
      erreurs[champ] = `${REGLAGE_MAX} au maximum.`;
      continue;
    }
    reglages[champ] = valeur;
  }
  return { reglages, erreurs };
}

export async function updateReglagesAdmin(
  session: SessionRecord,
  raw: unknown,
  deps: InscriptionsServiceDeps = {},
): Promise<ReglagesAdminState> {
  const store = deps.store ?? getInscriptionsStore();
  const { reglages, erreurs } = normaliserReglages(raw);
  if (Object.keys(erreurs).length > 0) {
    throw new ReglagesInvalidesError(erreurs);
  }
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new Error('Aucune édition configurée : exécute pnpm -F @azzel/web db:migrate');
  }
  await store.updateReglagesEdition({
    organisationId: session.organisationId,
    editionId: edition.id,
    accountId: session.accountId,
    reglages,
  });
  return getReglagesAdmin(session, deps);
}

export async function attribuerPlaceAdmin(
  session: SessionRecord,
  coureurId: unknown,
  deps: InscriptionsServiceDeps = {},
): Promise<{ resultat: ResultatAttribution; etat: ReglagesAdminState }> {
  const store = deps.store ?? getInscriptionsStore();
  if (typeof coureurId !== 'string' || coureurId === '') {
    throw new ReglagesInvalidesError({ coureurId: 'Coureur manquant.' } as Record<string, string>);
  }
  const resultat = await store.attribuerPlace({
    organisationId: session.organisationId,
    coureurId,
    maintenant: new Date(),
  });
  return { resultat, etat: await getReglagesAdmin(session, deps) };
}

export async function getHebergementState(
  organisationId: string,
  deps: InscriptionsServiceDeps = {},
): Promise<HebergementState> {
  const store = deps.store ?? getInscriptionsStore();
  try {
    const edition = await store.findCurrentEdition(organisationId);
    if (!edition) {
      return HEBERGEMENT_INDISPONIBLE;
    }
    const occupes = await store.countHebergementsOccupes(edition.id, organisationId);
    const restantes = placesRestantes(edition.capaciteHebergement, occupes);
    return {
      restantes,
      capacite: edition.capaciteHebergement,
      complet: restantes === 0,
      prixDa: edition.prixHebergementDa,
    };
  } catch (error) {
    // Panne : l'option est presentee comme indisponible plutot que proposee a
    // tort — promettre un lit qu'on ne peut pas compter serait pire.
    console.warn(
      '[inscriptions] contingent d’hébergement indisponible :',
      error instanceof Error ? error.message : error,
    );
    return HEBERGEMENT_INDISPONIBLE;
  }
}

export async function getPlacesState(
  organisationId: string,
  deps: InscriptionsServiceDeps = {},
): Promise<PlacesState> {
  const store = deps.store ?? getInscriptionsStore();
  try {
    const edition = await store.findCurrentEdition(organisationId);
    if (!edition) {
      return PLACES_MUETTES;
    }
    const occupees = await store.countPlacesOccupees(edition.id, organisationId);
    const restantes = placesRestantes(edition.capacite, occupees);
    return {
      capacite: edition.capacite,
      restantes,
      afficher: doitAfficherPlaces(restantes, edition.seuilAffichagePlaces),
      complet: restantes === 0,
    };
  } catch (error) {
    console.warn(
      '[inscriptions] compteur de places indisponible :',
      error instanceof Error ? error.message : error,
    );
    return PLACES_MUETTES;
  }
}

export async function getInscriptionState(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<InscriptionState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return { edition: null, epreuves: [], coureur: null };
  }
  const epreuves = await store.listEpreuves(edition.id, session.organisationId);
  const coureur = await store.findCoureurByAccount(
    session.accountId,
    edition.id,
    session.organisationId,
  );
  return {
    edition: toEditionSummary(edition),
    epreuves: epreuves.map(toEpreuveSummary),
    coureur: coureur ? toCoureurSummary(coureur) : null,
  };
}

export async function submitInscription(
  session: SessionRecord,
  rawInput: unknown,
  deps: InscriptionsServiceDeps = {},
): Promise<CoureurSummary> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new Error('Aucune édition configurée : exécute pnpm -F @azzel/web db:migrate');
  }
  if (!isRegistrationOpen(edition.registrationClosesAt)) {
    throw new RegistrationClosedError(edition.registrationClosesAt);
  }
  const epreuves = await store.listEpreuves(edition.id, session.organisationId);
  const input = normalizeInscriptionInput(rawInput);
  const errors = validateInscriptionInput(
    input,
    epreuves.map((epreuve) => epreuve.slug),
    edition.dateCourse,
  );
  if (hasFieldErrors(errors)) {
    throw new InvalidFieldsError(errors);
  }
  const epreuve = epreuves.find((candidate) => candidate.slug === input.epreuve);
  if (!epreuve) {
    throw new InvalidFieldsError({ epreuve: 'Choisis ton épreuve.' });
  }
  const derived = deriveAgeAndCategory(input.dateNaissance, edition.dateCourse);
  if (!derived) {
    throw new InvalidFieldsError({ dateNaissance: 'Date de naissance invalide.' });
  }
  const record = await store.upsertCoureur({
    organisationId: session.organisationId,
    accountId: session.accountId,
    editionId: edition.id,
    epreuveId: epreuve.id,
    prenom: input.prenom,
    nom: input.nom,
    telephone: input.telephone,
    contactUrgenceNom: input.contactUrgenceNom,
    contactUrgenceTelephone: input.contactUrgenceTelephone,
    dateNaissance: input.dateNaissance,
    tailleTshirt: input.tailleTshirt,
    genre: input.genre,
    wilaya: input.wilaya,
    // Hors étranger, le store écrit NULL (au plus près du CHECK 0044).
    pays: input.pays,
    hebergement: input.hebergement === 'oui',
    age: derived.age,
    categorieAge: derived.category,
  });
  notifyOutbox(deps);
  return toCoureurSummary(record);
}

export interface DocumentSummary {
  slug: string;
  titre: string;
  version: string;
  content: string;
}

export interface AcceptanceSummary {
  acceptedAt: string;
  version: string;
}

export interface AcceptancesState {
  edition: EditionSummary | null;
  coureurStatus: string | null;
  documents: DocumentSummary[];
  acceptances: {
    decharge: AcceptanceSummary | null;
    reglement: AcceptanceSummary | null;
  };
}

export interface AcceptancesResult {
  decharge: AcceptanceSummary;
  reglement: AcceptanceSummary;
}

export function normalizeAcceptancesInput(raw: unknown): { decharge: boolean; reglement: boolean } {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    decharge: record.decharge === true,
    reglement: record.reglement === true,
  };
}

export async function getAcceptancesState(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<AcceptancesState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return {
      edition: null,
      coureurStatus: null,
      documents: [],
      acceptances: { decharge: null, reglement: null },
    };
  }
  const [documents, coureur] = await Promise.all([
    store.findDocuments(session.organisationId),
    store.findCoureurByAccount(session.accountId, edition.id, session.organisationId),
  ]);
  return {
    edition: toEditionSummary(edition),
    coureurStatus: coureur ? coureur.status : null,
    documents: documents.map((document) => ({
      slug: document.slug,
      titre: documentTitle(document.slug),
      version: document.version,
      content: document.content,
    })),
    acceptances: {
      decharge: coureur ? acceptanceSummary(coureur.dechargeAcceptedAt, coureur.dechargeVersion) : null,
      reglement: coureur
        ? acceptanceSummary(coureur.reglementAcceptedAt, coureur.reglementVersion)
        : null,
    },
  };
}

export async function acceptDocuments(
  session: SessionRecord,
  rawInput: unknown,
  deps: InscriptionsServiceDeps = {},
): Promise<AcceptancesResult> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new Error('Aucune édition configurée : exécute pnpm -F @azzel/web db:migrate');
  }
  const input = normalizeAcceptancesInput(rawInput);
  if (!input.decharge || !input.reglement) {
    throw new BothAcceptancesRequiredError();
  }
  const snapshot = await store.acceptDocuments({
    organisationId: session.organisationId,
    accountId: session.accountId,
    editionId: edition.id,
  });
  return {
    decharge: {
      acceptedAt: snapshot.dechargeAcceptedAt.toISOString(),
      version: snapshot.dechargeVersion,
    },
    reglement: {
      acceptedAt: snapshot.reglementAcceptedAt.toISOString(),
      version: snapshot.reglementVersion,
    },
  };
}

export const CHECKLIST_VALIDATION_EN_ATTENTE = 'En attente de validation par l’organisation';

/**
 * Tant que la preuve n'est pas déposée, la validation n'est PAS « en attente »
 * de l'organisation : c'est au coureur d'agir. Écrire « en attente de
 * validation » dès l'inscription laissait croire qu'il avait tout fait.
 */
export const CHECKLIST_VALIDATION_APRES_PREUVE = 'Après ton justificatif de paiement';

export const CHECKLIST_PREUVE_INDISPONIBLE = 'Indisponible (réessaie plus tard)';

/** Dossier expiré : rien à valider tant que le coureur ne l'a pas repris. */
export const CHECKLIST_VALIDATION_EXPIREE =
  'Inscription expirée faute de preuve dans le délai — modifie ton inscription pour la reprendre';

export const ACTION_MODIFIER_INSCRIPTION = 'Modifier mon inscription';

function checklistPiece(
  id: ChecklistPieceId,
  libelle: string,
  fait: boolean,
  extras: {
    action?: { label: string; href?: string } | null;
    texteSecondaire?: string | null;
    motifRefus?: string | null;
  } = {},
): ChecklistPiece {
  const action = extras.action;
  return {
    id,
    libelle,
    fait,
    ...(action != null ? { actionLabel: action.label } : {}),
    ...(action?.href != null ? { actionHref: action.href } : {}),
    ...(extras.texteSecondaire != null ? { texteSecondaire: extras.texteSecondaire } : {}),
    ...(extras.motifRefus != null ? { motifRefus: extras.motifRefus } : {}),
  };
}

export async function getChecklistState(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<ChecklistState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return { edition: null, pieces: [], recap: null };
  }
  const [coureurSettled, preuveSettled] = await Promise.allSettled([
    store.findCoureurByAccount(session.accountId, edition.id, session.organisationId),
    store.findActivePreuveByAccount(session.accountId, edition.id, session.organisationId),
  ]);
  if (coureurSettled.status === 'rejected') {
    throw coureurSettled.reason;
  }
  const coureur = coureurSettled.value;
  const preuve = preuveSettled.status === 'fulfilled' ? preuveSettled.value : null;
  const preuveIndisponible = preuveSettled.status === 'rejected';

  const inscriptionsOuvertes = isRegistrationOpen(edition.registrationClosesAt);
  const neutraliseSiFermees = (
    action: { label: string; href?: string } | null,
  ): { label: string; href?: string } | null => {
    if (action === null || action.href == null || inscriptionsOuvertes) {
      return action;
    }
    return { label: 'Inscriptions fermées' };
  };

  const dechargeFait =
    coureur !== null &&
    coureur.dechargeAcceptedAt !== null &&
    coureur.dechargeVersion !== null;
  const reglementFait =
    coureur !== null &&
    coureur.reglementAcceptedAt !== null &&
    coureur.reglementVersion !== null;
  const refuse = coureur !== null && coureur.status === COUREUR_STATUS_REFUSE;
  const expiree = coureur !== null && coureur.status === COUREUR_STATUS_EXPIREE;
  const validationFait = coureur !== null && coureur.status === COUREUR_STATUS_VALIDE;
  const peutDeposer = coureur === null || canDepositPreuve(coureur.status);
  // Refusé ou expiré : la seule action proposée est « Modifier mon
  // inscription », qui reprend le dossier (décision PO du 11/11/2026). Aucun
  // dépôt ni acceptation tant que la reprise n'est pas faite.
  const aReprendre = refuse || expiree;
  const peutAccepter = coureur !== null && peutAccepterDocuments(coureur.status);
  const enValidation = coureur !== null && coureur.status === COUREUR_STATUS_EN_VALIDATION;
  const enAttente = coureur !== null && coureur.status === COUREUR_STATUS_LISTE_ATTENTE;

  // Une preuve déposée ne se remplace plus (PO, 11/11/2026) : le dépôt fait
  // passer le dossier en validation, figé jusqu'à la décision. Seul le premier
  // dépôt, en constitution, est proposé.
  let actionPreuve: { label: string; href?: string } | null = null;
  if (!preuveIndisponible && preuve === null && peutDeposer) {
    actionPreuve = neutraliseSiFermees({
      label: 'Dépose ta preuve de paiement CCP',
      href: '/preuve',
    });
  }

  const pieces: ChecklistPiece[] = [
    checklistPiece('email', 'Email vérifié', true),
    checklistPiece('epreuve', 'Épreuve choisie', coureur !== null, {
      // Refusé ou expiré : l'action vit sur la pièce « validation », à côté
      // du motif — une seule action proposée, pas deux liens identiques.
      action: neutraliseSiFermees(
        coureur === null
          ? { label: `M’inscrire à l’édition ${edition.slug}`, href: '/inscription' }
          : inscriptionsOuvertes && estModifiable(coureur.status) && !aReprendre
            ? { label: ACTION_MODIFIER_INSCRIPTION, href: '/inscription' }
            : null,
      ),
    }),
    checklistPiece('decharge', 'Décharge acceptée', dechargeFait, {
      action:
        dechargeFait || (coureur !== null && !peutAccepter)
          ? null
          : { label: 'Accepter la décharge et le règlement', href: '/acceptations' },
    }),
    checklistPiece('reglement', 'Règlement accepté', reglementFait, {
      action:
        reglementFait || (coureur !== null && !peutAccepter)
          ? null
          : { label: 'Les deux documents s’acceptent ensemble' },
    }),
    // Une preuve refusée n'est pas une pièce « faite » : elle a été écartée.
    checklistPiece('preuve', 'Preuve de paiement CCP déposée', preuve !== null && !refuse, {
      action: preuveIndisponible ? null : actionPreuve,
      texteSecondaire: preuveIndisponible ? CHECKLIST_PREUVE_INDISPONIBLE : null,
    }),
    checklistPiece('validation', 'Dossier validé', validationFait, {
      action: neutraliseSiFermees(
        aReprendre ? { label: ACTION_MODIFIER_INSCRIPTION, href: '/inscription' } : null,
      ),
      // Liste d'attente : rien n'est dû, aucun texte n'évoque un paiement.
      // En validation : l'organisation examine, même si la preuve est
      // momentanément illisible.
      texteSecondaire:
        coureur === null || validationFait || refuse || enAttente
          ? null
          : expiree
            ? CHECKLIST_VALIDATION_EXPIREE
            : enValidation || preuve !== null
              ? CHECKLIST_VALIDATION_EN_ATTENTE
              : CHECKLIST_VALIDATION_APRES_PREUVE,
      motifRefus: refuse ? coureur.refusalReason : null,
    }),
  ];

  const recap: ChecklistRecap | null =
    coureur === null
      ? null
      : {
          epreuve: coureur.epreuveNom,
          distanceKm: coureur.distanceKm,
          categorieAge:
            AGE_CATEGORY_LABELS[coureur.categorieAge as AgeCategory] ?? coureur.categorieAge,
          tshirt: coureur.tailleTshirt,
          contactUrgenceNom: coureur.contactUrgenceNom,
          contactUrgenceTelephone: coureur.contactUrgenceTelephone,
          dateCourse: edition.dateCourse,
          dateCourseLibelle: dateCourseAffichee(edition.dateCourse, edition.dateCoursePublique)
            .libelle,
        };

  return { edition: toEditionSummary(edition), pieces, recap, statut: coureur?.status ?? null };
}

export interface DossierListEntry {
  coureurId: string;
  prenom: string;
  nom: string;
  email: string;
  epreuveNom: string;
  status: string;
  dossard: number | null;
  refusalReason: string | null;
  hasActivePreuve: boolean;
  preuveDepositedAt: string | null;
  acceptationsCompletes: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DossiersState {
  edition: EditionSummary | null;
  dossiers: DossierListEntry[];
  hasMore: boolean;
}

export interface AdminPreuveSummary {
  id: string;
  depositedAt: string;
  sizeBytes: number;
  mime: string;
  numeroTransaction: string | null;
}

export interface DossierDetailSummary {
  coureur: CoureurSummary;
  email: string;
  preuveActive: AdminPreuveSummary | null;
  decidePar: { email: string; decidedAt: string } | null;
}

function toDossierListEntry(item: DossierListItem): DossierListEntry {
  return {
    coureurId: item.coureurId,
    prenom: item.prenom,
    nom: item.nom,
    email: item.email,
    epreuveNom: item.epreuveNom,
    status: item.status,
    dossard: item.dossard,
    refusalReason: item.refusalReason,
    hasActivePreuve: item.hasActivePreuve,
    preuveDepositedAt: item.preuveDepositedAt ? item.preuveDepositedAt.toISOString() : null,
    acceptationsCompletes: item.acceptationsCompletes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function getDossiersState(
  session: SessionRecord,
  rawSearch?: string | null,
  deps: InscriptionsServiceDeps = {},
): Promise<DossiersState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return { edition: null, dossiers: [], hasMore: false };
  }
  const search = typeof rawSearch === 'string' ? rawSearch.trim() : '';
  const list = await store.listCoureurs({
    organisationId: session.organisationId,
    editionId: edition.id,
    search: search.length > 0 ? search.slice(0, 100) : undefined,
  });
  return {
    edition: toEditionSummary(edition),
    dossiers: list.items.map(toDossierListEntry),
    hasMore: list.hasMore,
  };
}

export async function getDossierDetail(
  session: SessionRecord,
  coureurId: string,
  deps: InscriptionsServiceDeps = {},
): Promise<DossierDetailSummary | null> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return null;
  }
  const detail = await store.findDossierDetail({
    organisationId: session.organisationId,
    editionId: edition.id,
    coureurId,
  });
  if (!detail) {
    return null;
  }
  return {
    coureur: toCoureurSummary(detail.coureur),
    email: detail.email,
    preuveActive: detail.preuveActive
      ? {
          id: detail.preuveActive.id,
          depositedAt: detail.preuveActive.createdAt.toISOString(),
          sizeBytes: detail.preuveActive.sizeBytes,
          mime: detail.preuveActive.mime,
          numeroTransaction: detail.preuveActive.numeroTransaction,
        }
      : null,
    decidePar: detail.decidePar
      ? { email: detail.decidePar.email, decidedAt: detail.decidePar.decidedAt.toISOString() }
      : null,
  };
}

export function normalizeDecisionInput(
  raw: unknown,
): { decision: DossierDecision; refusalReason: string | null } {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const decision = record.decision;
  if (decision !== 'valider' && decision !== 'refuser') {
    throw new DecisionInvalidError();
  }
  if (decision === 'valider') {
    return { decision, refusalReason: null };
  }
  const refusalReason = normalizeRefusalReason(record.motif);
  if (refusalReason.length === 0) {
    throw new RefusalReasonRequiredError();
  }
  if (refusalReason.length > MAX_REFUSAL_REASON_LENGTH) {
    throw new RefusalReasonTooLongError(MAX_REFUSAL_REASON_LENGTH);
  }
  return { decision, refusalReason };
}

export async function decideDossier(
  session: SessionRecord,
  coureurId: string,
  rawInput: unknown,
  deps: InscriptionsServiceDeps = {},
): Promise<CoureurSummary> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new Error('Aucune édition configurée : exécute pnpm -F @azzel/web db:migrate');
  }
  const input = normalizeDecisionInput(rawInput);
  const record = await store.decideDossier({
    organisationId: session.organisationId,
    editionId: edition.id,
    coureurId,
    decision: input.decision,
    refusalReason: input.refusalReason,
    decidedBy: session.accountId,
  });
  notifyOutbox(deps);
  return toCoureurSummary(record);
}

export type DossardsAttribution = DossardsAttributionStore;

export async function attribuerDossards(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<DossardsAttribution> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new NoEditionError();
  }
  return store.attribuerDossards({
    organisationId: session.organisationId,
    editionId: edition.id,
  });
}

// Story 4.1 — e-dossard du coureur : tout ce que la page /espace-coureur/
// e-dossard affiche, SANS donnée d'un autre coureur. Le jeton naît ici
// (première consultation du validé) et le service n'expose JAMAIS le payload
// QR : l'encodage `azzel-e1:<jeton>` reste l'affaire des clients (page web,
// route API 6.1) via shared.

export type { EdossardState } from '@azzel/shared';

/**
 * E-dossard du coureur de la session (édition courante). Null si le dossier
 * n'est pas validé (ou pas de coureur) : la page affiche alors le message
 * d'attente renvoyant vers la checklist — AUCUN QR. NoEditionError sinon
 * (même garde que l'attribution des dossards).
 */
export async function obtenirEdossard(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<EdossardState | null> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new NoEditionError();
  }
  const data = await store.obtenirOuCreerJetonEdossard({
    organisationId: session.organisationId,
    accountId: session.accountId,
    editionId: edition.id,
  });
  if (!data) {
    return null;
  }
  return { ...data, editionNom: edition.nom };
}
