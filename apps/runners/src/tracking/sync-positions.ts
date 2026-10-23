import {
  SYNC_POSITION_MAX_LOT,
  POSITION_SCHEMA_VERSION,
  estHorodatageValide,
  isErrorEnvelope,
  nowIsoUtc,
  STATUTS_SYNC_POSITION,
  type PositionTerrain,
  type ReponseLotPosition,
} from '@azzel/shared';

import { API_BASE_URL } from '../config';
import type { EntreeJournalSync, OutboxSuivi, PositionOutbox } from './outbox-sqlite';
import { outboxSuivi } from './outbox-sqlite';
import { lireAppareilClient, lireJetonAppareil, ecrireJetonAppareil } from './suivi-store';

// Story 6.2 — moteur de sync des positions : orchestre l'outbox SQLite
// (append-only immuable) vers POST /api/coureur/tracking/sync par lots
// idempotents ≤ SYNC_POSITION_MAX_LOT, Bearer jeton d'appareil SEUL (AD-5 —
// indépendant des sessions, la outbox survit à un login web ailleurs). Pur
// par injections (tests sans RN ni réseau) : « déjà-connu » marque AUSSI
// envoyé (le serveur connaît), les rejets restent en file (journalisés,
// jamais perdus), 413 → découpage réactif en moitiés, 401 jeton →
// ré-enregistrement via session puis rejeu. Les erreurs RÉSEAU/RÉVOCATION/
// lot-invalide sont absorbées (décrites par le retour) ; une erreur de
// STOCKAGE LOCAL (lister/marquer/journaliser) rejette vers l'appelant —
// le câblage App.tsx l'attrape, la file reste intacte.

export type StatutSyncPositions =
  | 'rien-a-envoyer'
  | 'envoye'
  | 'reseau-indisponible'
  | 'appareil-revoque'
  | 'lot-invalide'
  | 'sans-jeton';

export interface ResultatSyncPositions {
  statut: StatutSyncPositions;
  /** Lots partis avec succès (y compris partiels avant une coupure réseau). */
  lots: number;
  envoyes: number;
  dejaConnus: number;
  rejetes: number;
  /** Compteur d'attente APRÈS passage (le bandeau s'y raccroche). */
  enAttente: number;
}

export type ReponsePosterLotPositions =
  | { ok: true; reponse: ReponseLotPosition }
  | {
      ok: false;
      erreur: 'reseau' | 'appareil-revoque' | 'authentification' | 'lot-trop-grand';
    }
  /** 400 TERMINAL (position_invalide/corps_invalide) : rejeté à l'adaptateur, motif journalisé. */
  | { ok: false; erreur: 'lot-invalide'; motif: string };

/** Position outbox → contrat shared (la clé ne part JAMAIS au fil). */
function versPositionTerrain(position: PositionOutbox): PositionTerrain {
  return {
    version: POSITION_SCHEMA_VERSION,
    lat: position.lat,
    lon: position.lon,
    capteA: position.capteA,
  };
}

export interface DepsSyncPositions {
  lireJeton(): Promise<string | null>;
  /** Identifiant d'installation stable (clé du lot — appareil propose). */
  lireAppareilId(): Promise<string>;
  /** Ré-enregistrement via SESSION coureur (register-then-retry sur 401). */
  enregistrer(): Promise<boolean>;
  listerEnAttente(limite: number): Promise<PositionOutbox[]>;
  marquerEnvoyees(cles: string[]): Promise<void>;
  ajouterEntreeJournal(entree: Omit<EntreeJournalSync, 'id'>): Promise<void>;
  compterEnAttente(): Promise<number>;
  posterLot(jeton: string, appareilId: string, positions: PositionOutbox[]): Promise<ReponsePosterLotPositions>;
  /**
   * Entre deux lots : false = la désactivation/logout a eu lieu EN VOL —
   * la boucle s'arrête proprement (les lots restants attendent le prochain
   * passage, rien n'est perdu).
   */
  doitContinuer?(): boolean;
}

function decouperEnTranches<T>(positions: T[], tailleMax: number): T[][] {
  const tranches: T[][] = [];
  for (let index = 0; index < positions.length; index += tailleMax) {
    tranches.push(positions.slice(index, index + tailleMax));
  }
  return tranches;
}

/** Offset horloge moyen d'un lot (ms) : référence serveur recuA − capture.
 *  Les capteA illisibles sont IGNORÉS (garde estHorodatageValide) — jamais
 *  de NaN dans le journal. */
export function offsetMoyenLot(recuA: string, positions: PositionOutbox[]): number | null {
  const reference = Date.parse(recuA);
  if (Number.isNaN(reference)) {
    return null;
  }
  let total = 0;
  let lus = 0;
  for (const position of positions) {
    if (!estHorodatageValide(position.capteA)) {
      continue;
    }
    total += reference - Date.parse(position.capteA);
    lus += 1;
  }
  return lus > 0 ? Math.round(total / lus) : null;
}

/**
 * Un passage complet : vidage de la file par tranches ≤ 200. Les erreurs
 * RÉSEAU/révocation/lot-invalide sont absorbées et décrites par le retour
 * (jamais d'exception vers l'appelant pour ces cas) ; une erreur de stockage
 * local (lister/marquer/journal) rejette — le câblage l'attrape.
 */
export async function synchroniserPositions(
  deps: DepsSyncPositions,
): Promise<ResultatSyncPositions> {
  const jeton = await deps.lireJeton();
  if (jeton === null) {
    return {
      statut: 'sans-jeton',
      lots: 0,
      envoyes: 0,
      dejaConnus: 0,
      rejetes: 0,
      enAttente: await deps.compterEnAttente(),
    };
  }
  const appareilId = await deps.lireAppareilId();
  const positions = await deps.listerEnAttente(Number.MAX_SAFE_INTEGER);
  if (positions.length === 0) {
    return {
      statut: 'rien-a-envoyer',
      lots: 0,
      envoyes: 0,
      dejaConnus: 0,
      rejetes: 0,
      enAttente: 0,
    };
  }

  let lots = 0;
  let envoyes = 0;
  let dejaConnus = 0;
  let rejetes = 0;
  let echec: 'reseau' | 'appareil-revoque' | 'authentification' | 'lot-trop-grand' | 'lot-invalide' | null = null;
  let motifLotInvalide: string | null = null;

  /** Traite une tranche ; 413 → découpage réactif en deux moitiés. */
  const traiterTranche = async (tranche: PositionOutbox[]): Promise<boolean> => {
    const envoi = await deps.posterLot(jeton, appareilId, tranche);
    if (!envoi.ok) {
      if (envoi.erreur === 'lot-trop-grand' && tranche.length > 1) {
        // La borne serveur a bougé sous nos pieds : on divise et on
        // réessaie — chaque moitié progresse indépendamment.
        const milieu = Math.ceil(tranche.length / 2);
        if (!(await traiterTranche(tranche.slice(0, milieu)))) {
          return false;
        }
        return traiterTranche(tranche.slice(milieu));
      }
      if (envoi.erreur === 'lot-invalide') {
        motifLotInvalide = envoi.motif;
      }
      echec = envoi.erreur;
      return false;
    }

    const { reponse } = envoi;
    // Marquage : accepté ET déjà-connu (le serveur connaît) ; les rejets
    // RESTENT en file — ils seront re-proposés et re-journalisés, jamais
    // perdus ni supprimés localement.
    const clesTranche = new Set(tranche.map((position) => position.cle));
    const clesAConnaitre = reponse.resultats
      .filter((resultat) => resultat.statut !== 'rejeté' && clesTranche.has(resultat.cle))
      .map((resultat) => resultat.cle);
    await deps.marquerEnvoyees(clesAConnaitre);

    const motifs = reponse.resultats
      .filter((resultat) => resultat.statut === 'rejeté')
      .map((resultat) => resultat.motif ?? 'rejeté');
    await deps.ajouterEntreeJournal({
      horodatage: nowIsoUtc(),
      envoyes: reponse.compteurs.acceptes,
      dejaConnus: reponse.compteurs.dejaConnus,
      rejetes: reponse.compteurs.rejetes,
      motifs,
      offsetMoyenMs: offsetMoyenLot(
        reponse.recuA,
        // L'offset se juge sur les positions que le serveur CONNAÎT.
        tranche.filter((position) => clesAConnaitre.includes(position.cle)),
      ),
    });

    lots += 1;
    envoyes += reponse.compteurs.acceptes;
    dejaConnus += reponse.compteurs.dejaConnus;
    rejetes += reponse.compteurs.rejetes;
    return true;
  };

  for (const tranche of decouperEnTranches(positions, SYNC_POSITION_MAX_LOT)) {
    if (!(await traiterTranche(tranche))) {
      // Lot INVALIDE (400 serveur) : TERMINAL — le rejeu du même octet ne
      // changera rien. STOP net, motif journalisé, la boucle n'empile pas.
      if (echec === 'lot-invalide') {
        await deps.ajouterEntreeJournal({
          horodatage: nowIsoUtc(),
          envoyes: 0,
          dejaConnus: 0,
          rejetes: 0,
          motifs: [motifLotInvalide ?? 'envoi refusé par le serveur'],
          offsetMoyenMs: null,
        });
        return {
          statut: 'lot-invalide',
          lots,
          envoyes,
          dejaConnus,
          rejetes,
          enAttente: await deps.compterEnAttente(),
        };
      }
      // Révoqué : STOP net, rien n'est marqué — « Appelle l'équipe » (AD-5).
      // Jeton inconnu : remonté au caller pour register-then-retry.
      // Réseau (ou 413 insécable sur une position seule) : rien n'est
      // perdu, le prochain déclenchement reprend ici.
      const statut: StatutSyncPositions =
        echec === 'appareil-revoque'
          ? 'appareil-revoque'
          : echec === 'authentification'
            ? 'sans-jeton'
            : 'reseau-indisponible';
      return {
        statut,
        lots,
        envoyes,
        dejaConnus,
        rejetes,
        enAttente: await deps.compterEnAttente(),
      };
    }
    // Désactivation/logout EN VOL entre deux lots : arrêt propre, les
    // tranches restantes attendent le prochain passage.
    if (deps.doitContinuer && !deps.doitContinuer()) {
      return {
        statut: lots > 0 ? 'envoye' : 'rien-a-envoyer',
        lots,
        envoyes,
        dejaConnus,
        rejetes,
        enAttente: await deps.compterEnAttente(),
      };
    }
  }

  return {
    statut: 'envoye',
    lots,
    envoyes,
    dejaConnus,
    rejetes,
    enAttente: await deps.compterEnAttente(),
  };
}

/**
 * Register-then-retry (pur, testé) : sans-jeton → ré-enregistrement via
 * SESSION coureur → nouvelle tentative. La session morte aussi (AD-5 dans
 * l'autre sens) rend le résultat initial : sync différée, hors-ligne
 * apparent — la file reste affichée, rien n'est perdu.
 */
export async function synchroniserPositionsAvecEnregistrement(
  deps: DepsSyncPositions,
): Promise<ResultatSyncPositions> {
  const resultat = await synchroniserPositions(deps);
  if (resultat.statut !== 'sans-jeton') {
    return resultat;
  }
  const enregistre = await deps.enregistrer();
  if (!enregistre) {
    return resultat;
  }
  return synchroniserPositions(deps);
}

// ---------------------------------------------------------------------------
// Câblage réel (app native) : fetch + SecureStore + SQLite. Les tests purs
// injectent leurs propres deps — ces helpers ne font qu'assembler.
// ---------------------------------------------------------------------------

function estReponseLotPositionValide(valeur: unknown): valeur is ReponseLotPosition {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as {
    resultats?: unknown;
    compteurs?: unknown;
    recuA?: unknown;
  };
  if (!Array.isArray(candidat.resultats)) {
    return false;
  }
  const compteurs = candidat.compteurs as Record<string, unknown> | undefined;
  return (
    typeof compteurs === 'object' &&
    compteurs !== null &&
    typeof compteurs.acceptes === 'number' &&
    typeof compteurs.dejaConnus === 'number' &&
    typeof compteurs.rejetes === 'number' &&
    typeof candidat.recuA === 'string' &&
    candidat.resultats.every(
      (resultat) =>
        typeof resultat === 'object' &&
        resultat !== null &&
        typeof (resultat as { cle?: unknown }).cle === 'string' &&
        STATUTS_SYNC_POSITION.includes(
          (resultat as { statut?: unknown }).statut as (typeof STATUTS_SYNC_POSITION)[number],
        ),
    )
  );
}

/** 400 TERMINAUX : rejouer les mêmes octets ne changera rien (pas de retry infini). */
const CODES_400_TERMINAUX = new Set(['tracking.position_invalide', 'tracking.corps_invalide']);

/**
 * fetch + délai — AbortController + setTimeout (et PAS AbortSignal.timeout,
 * absent d'Hermes/RN, voir api-client.ts) : une requête qui traîne ne
 * bloque pas la file à vie.
 */
function fetchAvecDelai(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  delaiMs: number,
): Promise<Response> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  return fetchImpl(url, { ...init, signal: controleur.signal }).finally(() => {
    clearTimeout(minuteur);
  });
}

/** Poster un lot par Bearer appareil : mappe réseau/401/400/413 en états du moteur. */
export function creerPosterLotPositions(
  fetchImpl: typeof fetch,
  baseUrl = API_BASE_URL,
  timeoutMs = 30_000,
): (jeton: string, appareilId: string, positions: PositionOutbox[]) => Promise<ReponsePosterLotPositions> {
  return async (jeton, appareilId, positions) => {
    const corps = JSON.stringify({
      appareilId,
      positions: positions.map(versPositionTerrain),
    });
    let response: Response;
    try {
      response = await fetchAvecDelai(
        fetchImpl,
        `${baseUrl}/api/coureur/tracking/sync`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
          body: corps,
          cache: 'no-store',
        },
        timeoutMs,
      );
    } catch {
      return { ok: false, erreur: 'reseau' };
    }
    if (response.status === 401) {
      const corpsErreur = await response.json().catch(() => null);
      const code = isErrorEnvelope(corpsErreur) ? corpsErreur.error.code : '';
      if (code === 'tracking.appareil_revoked') {
        return { ok: false, erreur: 'appareil-revoque' };
      }
      return { ok: false, erreur: 'authentification' };
    }
    if (response.status === 413) {
      // Lot (ou corps) trop grand : le moteur découpe et réessaie.
      return { ok: false, erreur: 'lot-trop-grand' };
    }
    if (response.status === 400) {
      // Rejet définitif du lot par le serveur (contrat) : maquiller ça en
      // « réseau » serait un retry infini — état terminal dédié.
      const corpsErreur = await response.json().catch(() => null);
      const code = isErrorEnvelope(corpsErreur) ? corpsErreur.error.code : '';
      if (CODES_400_TERMINAUX.has(code)) {
        return { ok: false, erreur: 'lot-invalide', motif: corpsErreur.error.message };
      }
    }
    if (!response.ok) {
      return { ok: false, erreur: 'reseau' };
    }
    const corpsReponse = await response.json().catch(() => null);
    return estReponseLotPositionValide(corpsReponse)
      ? { ok: true, reponse: corpsReponse }
      : { ok: false, erreur: 'reseau' };
  };
}

/** Options du ré-enregistrement (injectées par le câblage App.tsx). */
export interface OptionsEnregistrementAppareil {
  /**
   * Garde anti-course logout/sync : la « génération » de session capturée
   * au départ de la sync — false = un logout/changement de compte a eu lieu
   * en vol, le jeton reçu ne doit PAS être écrit (il appartient à l'ancien
   * coureur).
   */
  sessionValable?: () => boolean;
}

/**
 * Enregistrement du téléphone au canal sync (session coureur requise) :
 * appelé quand le jeton manque. False sans exception (hors-ligne, session
 * morte, stockage refusé, session révoquée en vol) : différé, la file
 * reste affichée.
 */
export async function enregistrerAppareilPourSync(
  sessionToken: string | null,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  baseUrl = API_BASE_URL,
  options: OptionsEnregistrementAppareil = {},
): Promise<boolean> {
  if (sessionToken === null) {
    return false;
  }
  try {
    const appareilId = await lireAppareilClient();
    const response = await fetchAvecDelai(
      fetchImpl,
      `${baseUrl}/api/coureur/tracking/appareil`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ appareilClient: appareilId }),
        cache: 'no-store',
      },
      30_000,
    );
    if (!response.ok) {
      return false;
    }
    const corps = (await response.json().catch(() => null)) as { jeton?: unknown } | null;
    if (typeof corps?.jeton !== 'string' || corps.jeton.length === 0) {
      return false;
    }
    // Logout/changement de compte PENDANT la requête : le jeton reçu
    // appartient à l'ancienne session — jamais écrit sur l'appareil.
    if (options.sessionValable && !options.sessionValable()) {
      return false;
    }
    await ecrireJetonAppareil(corps.jeton);
    return true;
  } catch {
    return false;
  }
}

/** Options du câblage réel (garde anti-course transmise à l'enregistrement). */
export interface OptionsDepsSyncPositions extends OptionsEnregistrementAppareil {}

/** Deps réelles du moteur : SecureStore + SQLite + fetch. */
export function creerDepsSyncPositions(
  sessionToken: () => string | null,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  outbox: OutboxSuivi = outboxSuivi,
  options: OptionsDepsSyncPositions = {},
): DepsSyncPositions {
  return {
    lireJeton: () => lireJetonAppareil(),
    lireAppareilId: () => lireAppareilClient(),
    enregistrer: () =>
      enregistrerAppareilPourSync(sessionToken(), fetchImpl, API_BASE_URL, {
        sessionValable: options.sessionValable,
      }),
    listerEnAttente: (limite) => Promise.resolve(outbox.listerEnAttente(limite)),
    marquerEnvoyees: (cles) => {
      outbox.marquerEnvoyees(cles);
      return Promise.resolve();
    },
    ajouterEntreeJournal: (entree) => {
      outbox.ajouterEntreeJournal(entree);
      return Promise.resolve();
    },
    compterEnAttente: () => Promise.resolve(outbox.compterEnAttente()),
    posterLot: (jeton, appareilId, positions) =>
      creerPosterLotPositions(fetchImpl)(jeton, appareilId, positions),
  };
}
