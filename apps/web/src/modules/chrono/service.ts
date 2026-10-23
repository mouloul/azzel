import {
  MOTIF_REJET_CONTRAT_INVALIDE,
  SYNC_TERRAIN_MAX_LOT,
  CATEGORIES_AGE_CLASSEMENT,
  MAX_DERNIERS_ARRIVES,
  departagerExAequo,
  estCorpsLotSyncTerrainValide,
  estEvenementSyncTerrainValide,
  LIBELLE_CLASSEMENT,
  type CategorieAgeClassement,
  type ClassementEpreuve,
  type ClassementsEdition,
  type DernierArrive,
  type EvenementSyncTerrain,
  type LigneClassement,
  type ReponseLotSync,
  type ResultatsPublic,
} from '@azzel/shared';

import type { SessionRecord } from '@/modules/iam/store';

import {
  APPAREIL_CLIENT_MAX_LENGTH,
  compterStatuts,
  resultatEvenement,
  type AbandonRecord,
  type AnnulationResultat,
  type AppareilAuth,
  type AppareilRecord,
  type AlerteHorsDelais,
  type CheckpointCourse,
  type ClassementsRecord,
  type EpreuveHeureDepartRecord,
  type EtatCourseRecord,
  type MotifAbandon,
  type TerrainEvenementRecord,
  hasAbandonFieldErrors,
  hasAnnulationFieldErrors,
  hasHeuresDepartFieldErrors,
  normaliserSaisieAbandon,
  normaliserSaisieAnnulation,
  normaliserSaisieHeuresDepart,
  validerSaisieAbandon,
  validerSaisieAnnulation,
  validerSaisieHeuresDepart,
} from './domain';
import {
  AppareilClientInvalideError,
  AppareilNotFoundError,
  AppareilRevokedError,
  CorpsHeuresDepartInvalideError,
  CorpsSyncInvalideError,
  InvalidAbandonFieldsError,
  InvalidAnnulationFieldsError,
  InvalidHeuresDepartFieldsError,
  JetonAppareilInvalideError,
  LotTropGrandError,
} from './errors';
import { hashJetonAppareil, type ChronoStore } from './store';
import { getChronoStore } from './store';

// Story 4.5 — service chrono : la couche qui décide. L'enregistrement d'un
// appareil exige une SESSION (le volontaire atteste l'appareil) ; la sync
// n'exige QUE le jeton (AD-5) — la boîte d'envoi survit à une session révoquée,
// jamais à une révocation d'appareil.

export interface ChronoServiceDeps {
  store?: ChronoStore;
}

function estAppareilClientValide(appareilClient: unknown): appareilClient is string {
  return (
    typeof appareilClient === 'string' &&
    appareilClient.trim().length > 0 &&
    appareilClient.length <= APPAREIL_CLIENT_MAX_LENGTH
  );
}

/**
 * Enregistrement (session volontaire) : find-or-create par appareil_client.
 * Retourne le jeton BRUT une seule fois — seul le hash vit en base. Un appareil
 * RÉVOQUÉ est refusé : jamais de retour silencieux (AD-5, assistance humaine).
 */
export async function enregistrerAppareil(
  session: SessionRecord,
  appareilClient: unknown,
  deps: ChronoServiceDeps = {},
): Promise<{ appareilId: string; jeton: string; rotation: boolean }> {
  if (!estAppareilClientValide(appareilClient)) {
    throw new AppareilClientInvalideError();
  }
  const store = deps.store ?? getChronoStore();
  const enregistre = await store.enregistrerAppareil({
    organisationId: session.organisationId,
    appareilClient,
  });
  return { appareilId: enregistre.id, jeton: enregistre.jeton, rotation: enregistre.rotation };
}

/**
 * Garde du canal sync (Bearer appareil, SANS session) : hash lookup, refus
 * dédié si révoqué. Ne touche à RIEN d'autre — last_sync_at n'est rafraîchi
 * qu'après une ingestion RÉUSSIE (synchroniserLot).
 */
export async function verifierJetonAppareil(
  jeton: string,
  deps: ChronoServiceDeps = {},
): Promise<AppareilAuth> {
  const store = deps.store ?? getChronoStore();
  const appareil = await store.trouverAppareilParHash(hashJetonAppareil(jeton));
  if (appareil === null) {
    throw new JetonAppareilInvalideError();
  }
  if (appareil.revokedAt !== null) {
    throw new AppareilRevokedError();
  }
  return {
    id: appareil.id,
    organisationId: appareil.organisationId,
    appareilClient: appareil.appareilClient,
  };
}

/**
 * Ingestion d'un lot : contrat validé PAR ÉVÉNEMENT (shared, clé recalculée —
 * un événement hors contrat est rejeté individuellement « contrat invalide »,
 * il ne bloque JAMAIS la file), jetons résolus org-scopé, insertions
 * idempotentes (ON CONFLICT), réponse par événement + compteurs. L'horodatage
 * de réception SERVEUR est capturé UNE fois par lot — c'est lui, jamais
 * l'heure appareil, qui fonde l'arbitrage (AD-3).
 */
export async function synchroniserLot(
  appareil: AppareilAuth,
  corps: unknown,
  deps: ChronoServiceDeps = {},
): Promise<ReponseLotSync> {
  if (!estCorpsLotSyncTerrainValide(corps)) {
    throw new CorpsSyncInvalideError();
  }
  if (corps.evenements.length > SYNC_TERRAIN_MAX_LOT) {
    throw new LotTropGrandError(SYNC_TERRAIN_MAX_LOT);
  }
  const store = deps.store ?? getChronoStore();
  const reception = new Date();

  // Tri par événement : seuls les événements de contrat partent en insertion
  // (les autres ne sont JAMAIS stockés), les statuts reviennent dans l'ordre
  // du lot d'origine.
  const valides: EvenementSyncTerrain[] = [];
  const horsContrat = new Map<number, string>();
  corps.evenements.forEach((evenement, index) => {
    if (estEvenementSyncTerrainValide(evenement)) {
      valides.push(evenement);
    } else {
      const cle = (evenement as { cle?: unknown })?.cle;
      horsContrat.set(index, typeof cle === 'string' ? cle : '');
    }
  });

  const statutsValides = await store.insererLot({
    organisationId: appareil.organisationId,
    evenements: valides,
    reception,
  });

  // last_sync_at rafraîchi APRÈS l'ingestion réussie : une tentative refusée
  // (révoqué, base indisponible) ne rajeunit pas l'appareil.
  await store.rafraichirLastSync({
    organisationId: appareil.organisationId,
    appareilId: appareil.id,
    maintenant: reception,
  });

  const resultats: ReponseLotSync['resultats'] = corps.evenements.map(
    (evenement, index) => {
      const horsContratCle = horsContrat.get(index);
      if (horsContratCle !== undefined) {
        return { cle: horsContratCle, statut: 'rejeté', motif: MOTIF_REJET_CONTRAT_INVALIDE };
      }
      // Les événements valides ont été insérés DANS l'ordre du lot : le n-ième
      // valide (hors contrats) correspond au n-ième statut retourné.
      const rangValide = index - [...horsContrat.keys()].filter((cle) => cle < index).length;
      const statut = statutsValides[rangValide];
      if (!estEvenementSyncTerrainValide(evenement) || statut === undefined) {
        throw new Error('synchroniserLot : statut manquant pour un événement du lot');
      }
      return typeof statut === 'string'
        ? resultatEvenement(evenement, statut)
        : resultatEvenement(evenement, 'rejeté', statut.rejeté);
    },
  );
  return {
    resultats,
    compteurs: compterStatuts(resultats),
    recuA: reception.toISOString(),
  };
}

/**
 * Arbitrage AD-3 (pour les épopées 5/7) : le PREMIER événement reçu côté
 * serveur pour la clé naturelle (édition, coureur, checkpoint — NULL pour un
 * retrait). Lecture seule : jamais l'ingestion n'est modifiée.
 */
export async function premierRecu(
  session: SessionRecord,
  input: { editionId: string; jeton: string; checkpointId: string | null },
  deps: ChronoServiceDeps = {},
): Promise<TerrainEvenementRecord | null> {
  const store = deps.store ?? getChronoStore();
  return store.premierRecu({
    organisationId: session.organisationId,
    editionId: input.editionId,
    jeton: input.jeton,
    checkpointId: input.checkpointId,
  });
}

export async function listerAppareils(
  session: SessionRecord,
  deps: ChronoServiceDeps = {},
): Promise<AppareilRecord[]> {
  const store = deps.store ?? getChronoStore();
  return store.listerAppareils(session.organisationId);
}

/** Révocation (admin) : idempotente, la première date d'audit est conservée. */
export async function revoquerAppareil(
  session: SessionRecord,
  appareilId: string,
  deps: ChronoServiceDeps = {},
): Promise<AppareilRecord> {
  const store = deps.store ?? getChronoStore();
  const appareil = await store.revoquerAppareil({
    organisationId: session.organisationId,
    appareilId,
    maintenant: new Date(),
  });
  if (appareil === null) {
    throw new AppareilNotFoundError();
  }
  return appareil;
}

// ---------------------------------------------------------------------------
// Story 5.1 — tableau de bord live du PC course. Contrat sérialisé (API/page) :
// horodatages ISO 8601 UTC, genereA = instant serveur (horloge de calcul de la
// fraîcheur côté client). Le type est DÉRIVÉ d'EtatCourseRecord (Omit +
// extensions) : toute colonne ajoutée au record remonte automatiquement ici,
// la sérialisation ne duplique rien de non lié. Story 5.3 : abandones vit dans
// le record (abandons de l'édition), la carte PC l'affiche telle quelle.
// ---------------------------------------------------------------------------

/** Passage board sérialisé : même forme que le record, horodatage en ISO. */
export interface PassageCourseSerde {
  evenementId: string;
  dossard: number;
  horodatageReception: string;
}

/** Checkpoint board sérialisé : même forme que le record, passages en ISO. */
export interface CheckpointCourseSerde
  extends Omit<CheckpointCourse, 'passages'> {
  passages: PassageCourseSerde[];
}

/** Alerte hors-délais sérialisée (story 5.2) : barrière en ISO, reste à l'identique. */
export interface AlerteCourseSerde
  extends Omit<AlerteHorsDelais, 'barriereLe'> {
  barriereLe: string;
}

export interface EtatCourse
  extends Omit<EtatCourseRecord, 'checkpoints' | 'alertes' | 'fraicheur'> {
  checkpoints: CheckpointCourseSerde[];
  /** Recalculées à chaque état : le polling 5 s les émet et les retire. */
  alertes: AlerteCourseSerde[];
  /** max(horodatage_reception) ISO — null = aucune donnée reçue. */
  fraicheur: string | null;
  /** Instant de génération SERVEUR (ISO), rafraîchi à chaque polling. */
  genereA: string;
}

function versEtatCourse(record: EtatCourseRecord, genereA: Date): EtatCourse {
  return {
    ...record,
    checkpoints: record.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      passages: checkpoint.passages.map((passage) => ({
        evenementId: passage.evenementId,
        dossard: passage.dossard,
        horodatageReception: passage.horodatageReception.toISOString(),
      })),
    })),
    alertes: record.alertes.map((alerte) => ({
      ...alerte,
      barriereLe: alerte.barriereLe.toISOString(),
    })),
    fraicheur: record.fraicheur !== null ? record.fraicheur.toISOString() : null,
    genereA: genereA.toISOString(),
  };
}

/**
 * Agrégats du PC course pour la session organisateur : partants par épreuve,
 * retraits/passages arbitrés (AD-3), arrivés, en course, fraîcheur — tout
 * org-scopé (withOrg + RLS). Sans édition : état ZÉRO cohérent (jamais une
 * erreur — le PC affiche des cartes vides, pas un écran d'échec).
 */
export async function getEtatCourse(
  session: SessionRecord,
  deps: ChronoServiceDeps = {},
): Promise<EtatCourse> {
  const store = deps.store ?? getChronoStore();
  const record = await store.etatCourse(session.organisationId);
  return versEtatCourse(record, new Date());
}

// ---------------------------------------------------------------------------
// Story 5.3 — saisie d'un abandon (FR-17). Le service valide la FORME (champs,
// heure ISO passée — l'heure locale→ISO est convertie côté client), trace
// l'auteur (email de la session organisateur) et délègue la décision de course
// au store : dossard résolu, coureur parti, pas arrivé, pas déjà abandonné —
// tout dans la transaction d'insertion (AD-3 : premier reçu gagne).
// ---------------------------------------------------------------------------

/** Abandon enregistré, sérialisé pour la route (heure saisie en ISO). */
export interface AbandonEnregistre {
  dossard: number;
  lieu: string;
  motif: MotifAbandon;
  heure: string;
}

export async function saisirAbandon(
  session: SessionRecord,
  rawInput: unknown,
  deps: ChronoServiceDeps = {},
): Promise<AbandonEnregistre> {
  const store = deps.store ?? getChronoStore();
  const input = normaliserSaisieAbandon(rawInput);
  // UN SEUL instant serveur fonde la validation ET l'horodatage de réception :
  // une heure exactement égale à « maintenant » reste valide (bornes incluses).
  const maintenant = new Date();
  const errors = validerSaisieAbandon(input, maintenant);
  if (hasAbandonFieldErrors(errors)) {
    throw new InvalidAbandonFieldsError(errors);
  }
  const record: AbandonRecord = await store.saisirAbandon({
    organisationId: session.organisationId,
    dossard: input.dossard as number,
    lieu: input.lieu,
    motif: input.motif as MotifAbandon,
    horodatage: new Date(input.heure as string),
    auteurEmail: session.email,
    maintenant,
  });
  return {
    dossard: input.dossard as number,
    lieu: record.lieu,
    motif: record.motif,
    heure: record.horodatage.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Story 5.4 — annulation auditable d'un passage (AD-8). Le service valide la
// FORME (evenementId requis, motif 1–500), trace l'auteur (email de la
// session organisateur) et délègue la décision au store : cible résolue dans
// l'org/édition courante (retrait → 409 dédié), insertion idempotente (UNIQUE
// evenement_id). L'événement terrain reste INTACT — les lectures arbitrées
// (etatCourse/premierRecu) l'excluent, le ré-arbitrage « second fait foi »
// est automatique.
// ---------------------------------------------------------------------------

/** Annulation rendue à la route : message PC (dossard, checkpoint) + drapeau idempotent. */
export type AnnulationSerde = AnnulationResultat;

export async function annulerPassage(
  session: SessionRecord,
  rawInput: unknown,
  deps: ChronoServiceDeps = {},
): Promise<AnnulationSerde> {
  const store = deps.store ?? getChronoStore();
  const input = normaliserSaisieAnnulation(rawInput);
  const errors = validerSaisieAnnulation(input);
  if (hasAnnulationFieldErrors(errors)) {
    throw new InvalidAnnulationFieldsError(errors);
  }
  return store.annulerPassage({
    organisationId: session.organisationId,
    evenementId: input.evenementId as string,
    motif: input.motif,
    auteurEmail: session.email,
  });
}

// ---------------------------------------------------------------------------
// Story 7.1 — classements par épreuve et heures de départ officielles.
//
// getClassements : assemblage du contrat shared AU-DESSUS du record store —
// temps = réception serveur du premier passage ARRIVÉE arbitré − heure de
// départ OFFICIELLE de l'épreuve (AD-3 : jamais l'heure appareil, jamais le
// scan de départ), rangs ex æquo via departagerExAequo (1, 1, 3), abandons
// listés à part jamais rangés, « configure » par épreuve (sans heure de
// départ : jamais de temps faux à zéro). Le libellé « Classement
// provisoire » fait partie du contrat servi (jamais « officiel »).
//
// Heures de départ : la carte admin de /admin/course lit (getHeuresDepart)
// et écrit (enregistrerHeuresDepart — PUT organisateur, ISO UTC stocké,
// réaffichage heure locale côté client).
// ---------------------------------------------------------------------------

/** Épreuve avec heure de départ, sérialisée pour la page/route (ISO ou null). */
export interface EpreuveHeureDepartSerde {
  epreuveId: string;
  epreuveSlug: string;
  epreuveNom: string;
  distanceKm: number;
  heureDepart: string | null;
}

function versEpreuveHeureDepart(record: EpreuveHeureDepartRecord): EpreuveHeureDepartSerde {
  return {
    epreuveId: record.epreuveId,
    epreuveSlug: record.slug,
    epreuveNom: record.nom,
    distanceKm: record.distanceKm,
    heureDepart: record.heureDepart !== null ? record.heureDepart.toISOString() : null,
  };
}

/** Priorité d'affichage des lignes : arrivés rangés, en course, abandonnés. */
const ORDRE_STATUT_CLASSEMENT: Record<LigneClassement['statut'], number> = {
  'arrivé': 0,
  'en-course': 1,
  'abandonné': 2,
};

/**
 * Garde categorieAge : la valeur de base doit vivre dans l'union du CONTRAT
 * (CATEGORIES_AGE_CLASSEMENT, calque du CHECK SQL) — une valeur inconnue
 * (défense en profondeur : la base la refuse déjà) replie sur 'Senior',
 * JAMAIS un cast silencieux qui ferait mentir le type.
 */
function categorieAgeContrat(valeur: string): CategorieAgeClassement {
  return (CATEGORIES_AGE_CLASSEMENT as readonly string[]).includes(valeur)
    ? (valeur as CategorieAgeClassement)
    : 'Senior';
}

function versClassements(record: ClassementsRecord, genereA: Date): ClassementsEdition {
  return {
    genereA: genereA.toISOString(),
    fraicheur: record.fraicheur !== null ? record.fraicheur.toISOString() : null,
    libelle: LIBELLE_CLASSEMENT,
    epreuves: record.epreuves.map((epreuve): ClassementEpreuve => {
      const configure = epreuve.heureDepart !== null;
      const lignes: LigneClassement[] = epreuve.lignes.map((ligne) => ({
        dossard: ligne.dossard,
        rang: null,
        // Temps UNIQUEMENT pour un arrivé d'une épreuve configurée : jamais
        // de temps faux à zéro, jamais de temps pour un abandonné (sorti de
        // course) ni un coureur en course.
        tempsMs:
          configure && ligne.statut === 'arrivé' && ligne.arriveeRecue !== null
            ? ligne.arriveeRecue.getTime() - (epreuve.heureDepart as Date).getTime()
            : null,
        statut: ligne.statut,
        categorieAge: categorieAgeContrat(ligne.categorieAge),
      }));
      // Rangs : entre coureurs de la MÊME épreuve uniquement, par temps
      // croissant (ex æquo : même rang, rang suivant sauté — 1, 1, 3).
      const arrivees = lignes.filter((ligne) => ligne.tempsMs !== null);
      arrivees.sort(
        (a, b) => (a.tempsMs as number) - (b.tempsMs as number) || a.dossard - b.dossard,
      );
      const rangs = departagerExAequo(arrivees.map((ligne) => ligne.tempsMs as number));
      arrivees.forEach((ligne, index) => {
        ligne.rang = rangs[index] ?? null;
      });
      lignes.sort(
        (a, b) =>
          ORDRE_STATUT_CLASSEMENT[a.statut] - ORDRE_STATUT_CLASSEMENT[b.statut] ||
          (a.rang ?? Number.POSITIVE_INFINITY) - (b.rang ?? Number.POSITIVE_INFINITY) ||
          a.dossard - b.dossard,
      );
      return {
        epreuveSlug: epreuve.slug,
        epreuveNom: epreuve.nom,
        distanceKm: epreuve.distanceKm,
        heureDepart: epreuve.heureDepart !== null ? epreuve.heureDepart.toISOString() : null,
        configure,
        lignes,
        abandons: epreuve.lignes
          .filter((ligne) => ligne.statut === 'abandonné')
          .map((ligne) => ligne.dossard)
          .sort((a, b) => a - b),
      };
    }),
  };
}

/**
 * Classements par épreuve de l'édition courante de l'organisation : UNE
 * transaction (NFR-4), lecture seule au-dessus de l'arbitrage 4.5 et des
 * saisies 5.x. Sans édition : état ZÉRO cohérent (épreuves vides), jamais
 * une erreur.
 */
export async function getClassements(
  organisationId: string,
  deps: ChronoServiceDeps = {},
): Promise<ClassementsEdition> {
  const store = deps.store ?? getChronoStore();
  const record = await store.classements(organisationId);
  return versClassements(record, new Date());
}

// ---------------------------------------------------------------------------
// Story 7.2 — résultats en direct partageables (FR-16, SM-5, AD-7).
//
// getResultatsPublic : le contrat public de /resultats, SANS session —
// organisation par défaut (pattern sponsors readDefaultOrgPartenaires), les
// classements 7.1 TELS QUELS (jamais recalculés) + les derniers arrivés
// calculés sur les MÊMES faits de la MÊME transaction classements() (aucune
// lecture supplémentaire : partants, arrivées arbitrées et heures de départ
// décrivent déjà le même instant cohérent, NFR-4).
//
// compterVisitePartage : agrégat quotidien anonyme (+1), appelé UNIQUEMENT
// par la page pour un chargement ?partage=1 — le polling ne compte jamais.
// ---------------------------------------------------------------------------

/**
 * Derniers arrivés du record classements : réception SERVEUR de l'arrivée
 * arbitrée DÉCROISSANTE (le plus récent en tête), bornés à
 * MAX_DERNIERS_ARRIVES. Seuls les partants ARRIVÉS y figurent — un abandonné
 * au scan d'arrivée tardif (réseau différé) reste abandonné (calque 5.3),
 * jamais exhibé comme « arrivé ». tempsMs null pour une épreuve sans heure
 * de départ : jamais de temps faux à zéro.
 */
function versDerniersArrives(record: ClassementsRecord): DernierArrive[] {
  const arrivees: (DernierArrive & { recu: Date })[] = [];
  for (const epreuve of record.epreuves) {
    for (const ligne of epreuve.lignes) {
      if (ligne.statut !== 'arrivé' || ligne.arriveeRecue === null) {
        continue;
      }
      arrivees.push({
        dossard: ligne.dossard,
        epreuveSlug: epreuve.slug,
        epreuveNom: epreuve.nom,
        tempsMs:
          epreuve.heureDepart !== null
            ? ligne.arriveeRecue.getTime() - epreuve.heureDepart.getTime()
            : null,
        recu: ligne.arriveeRecue,
      });
    }
  }
  arrivees.sort((a, b) => b.recu.getTime() - a.recu.getTime() || a.dossard - b.dossard);
  return arrivees.slice(0, MAX_DERNIERS_ARRIVES).map(({ recu: _recu, ...arrive }) => arrive);
}

/** Fenêtre du micro-cache partagé de getResultatsPublic (jamais > 5 s). */
const RESULTATS_PUBLIC_TTL_MS = 5_000;

/**
 * Micro-cache module : le snapshot servi (genereA compris) est renvoyé TEL
 * QUEL tant qu'il n'a pas expiré — la fraîcheur affichée décrit toujours le
 * SNAPSHOT, jamais un âge rajeuni.
 */
let cacheResultatsPublic: { valeur: ResultatsPublic; expireLe: number } | null = null;

/** Tests uniquement : invalide le micro-cache (isolation entre suites). */
export function resetResultatsPublicCacheForTests(): void {
  cacheResultatsPublic = null;
}

/**
 * Résultats publics de l'organisation PAR DÉFAUT (aucune session, AD-7 : tout
 * transite par le backend). Sans organisation par défaut : état ZÉRO cohérent
 * (épreuves vides), jamais une erreur — la vitrine affiche l'état vide.
 *
 * Micro-cache ~5 s PARTAGÉ page + polling : le jour J, N visiteurs pollant
 * toutes les 10 s n'imposent à la base qu'UNE lecture par fenêtre (AD-7 — le
 * backend absorbe la charge, jamais la base). Le snapshot (genereA compris)
 * est servi tel quel : l'âge affiché reste cohérent avec ce qui est montré.
 */
export async function getResultatsPublic(
  deps: ChronoServiceDeps = {},
): Promise<ResultatsPublic> {
  if (cacheResultatsPublic !== null && Date.now() < cacheResultatsPublic.expireLe) {
    return cacheResultatsPublic.valeur;
  }
  const store = deps.store ?? getChronoStore();
  const organisationId = await store.organisationParDefautId();
  const valeur: ResultatsPublic =
    organisationId === null
      ? {
          classements: versClassements({ edition: null, epreuves: [], fraicheur: null }, new Date()),
          derniersArrives: [],
        }
      : await lireResultats(store, organisationId);
  cacheResultatsPublic = { valeur, expireLe: Date.now() + RESULTATS_PUBLIC_TTL_MS };
  return valeur;
}

async function lireResultats(store: ChronoStore, organisationId: string): Promise<ResultatsPublic> {
  const record = await store.classements(organisationId);
  return {
    classements: versClassements(record, new Date()),
    derniersArrives: versDerniersArrives(record),
  };
}

/**
 * Comptage anonyme d'un chargement partagé (org par défaut, aucune session) :
 * la page l'appelle en BEST EFFORT — un échec n'affecte JAMAIS son rendu.
 */
export async function compterVisitePartage(deps: ChronoServiceDeps = {}): Promise<void> {
  const store = deps.store ?? getChronoStore();
  const organisationId = await store.organisationParDefautId();
  if (organisationId === null) {
    return;
  }
  await store.compterVisitePartage(organisationId);
}

/**
 * Carte « Heures de départ » (page /admin/course) : épreuves de l'édition
 * courante avec leur heure de départ officielle (ISO UTC ou null).
 */
export async function getHeuresDepart(
  session: SessionRecord,
  deps: ChronoServiceDeps = {},
): Promise<{ edition: { id: string; nom: string } | null; epreuves: EpreuveHeureDepartSerde[] }> {
  const store = deps.store ?? getChronoStore();
  const { edition, epreuves } = await store.listerHeuresDepart(session.organisationId);
  return { edition, epreuves: epreuves.map(versEpreuveHeureDepart) };
}

/**
 * PUT organisateur : validation de forme (heure ISO UTC ou null par épreuve,
 * épreuve unique), puis écriture sous GUC dans UNE transaction — les épreuves
 * inconnues de l'org/édition (RLS comprise) remontent en erreur champ.
 * Retourne l'état serveur complet (la carte s'y resynchronise).
 */
export async function enregistrerHeuresDepart(
  session: SessionRecord,
  rawInput: unknown,
  deps: ChronoServiceDeps = {},
): Promise<EpreuveHeureDepartSerde[]> {
  const store = deps.store ?? getChronoStore();
  const input = normaliserSaisieHeuresDepart(rawInput);
  if (input.heures === null) {
    throw new CorpsHeuresDepartInvalideError();
  }
  const errors = validerSaisieHeuresDepart(input);
  if (hasHeuresDepartFieldErrors(errors)) {
    throw new InvalidHeuresDepartFieldsError(errors);
  }
  const epreuves = await store.enregistrerHeuresDepart({
    organisationId: session.organisationId,
    heures: (input.heures as { epreuveId: string; heureDepart: string | null }[]).map((ligne) => ({
      epreuveId: ligne.epreuveId,
      heureDepart: ligne.heureDepart !== null ? new Date(ligne.heureDepart) : null,
    })),
  });
  return epreuves.map(versEpreuveHeureDepart);
}
