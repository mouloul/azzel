import {
  SYNC_TERRAIN_MAX_LOT,
  isErrorEnvelope,
  nowIsoUtc,
  STATUTS_SYNC_TERRAIN,
  type EvenementSyncTerrain,
  type ReponseLotSync,
} from '@azzel/shared';

import {
  ajouterEntreeJournal,
  compterEnAttente,
  listerEvenementsASynchroniser,
  lireJetonSync,
  marquerEnvoyes,
  obtenirAppareilId,
  enregistrerJetonSync,
  type EntreeJournalSync,
} from '@/lib/idb-volontaires';

// Story 4.5 (AD-2, AD-3, AD-5, NFR-3) — moteur de sync terrain : orchestre
// l'outbox (append-only immuable) vers POST /api/volontaires/sync par lots
// idempotents ≤ SYNC_TERRAIN_MAX_LOT. Pur par injections (tests sans DOM ni
// réseau) : le marquage d'envoi vit dans SON store, « déjà-connu » marque
// AUSSI envoyé (le serveur connaît), les rejets restent en file (journalisés,
// jamais perdus), une erreur réseau n'emporte RIEN — le prochain déclenchement
// (ouverture en ligne, `online`, bandeau) rejoue les tranches restantes.

export type StatutMoteurSync =
  | 'rien-a-envoyer'
  | 'envoye'
  | 'reseau-indisponible'
  | 'appareil-revoque'
  | 'sans-jeton';

export interface ResultatMoteurSync {
  statut: StatutMoteurSync;
  /** Lots partis avec succès (y compris partiels avant une coupure réseau). */
  lots: number;
  envoyes: number;
  dejaConnus: number;
  rejetes: number;
  /** Compteur d'attente APRÈS passage (le bandeau s'y raccroche). */
  enAttente: number;
}

export type ReponsePosterLot =
  | { ok: true; reponse: ReponseLotSync }
  | {
      ok: false;
      erreur: 'reseau' | 'appareil-revoque' | 'authentification' | 'lot-trop-grand';
    };

export interface DepsMoteurSync {
  lireJetonSync(): Promise<string | null>;
  listerEvenements(): Promise<EvenementSyncTerrain[]>;
  marquerEnvoyes(cles: string[]): Promise<boolean>;
  ajouterEntreeJournal(entree: Omit<EntreeJournalSync, 'id'>): Promise<boolean>;
  compterEnAttente(): Promise<number>;
  posterLot(jeton: string, evenements: EvenementSyncTerrain[]): Promise<ReponsePosterLot>;
}

function decouperEnTranches<T>(evenements: T[], tailleMax: number): T[][] {
  const tranches: T[][] = [];
  for (let index = 0; index < evenements.length; index += tailleMax) {
    tranches.push(evenements.slice(index, index + tailleMax));
  }
  return tranches;
}

/** Offset horloge moyen d'un lot (ms) : référence serveur recuA − heure appareil. */
export function offsetMoyenLot(
  recuA: string,
  evenements: EvenementSyncTerrain[],
): number | null {
  if (evenements.length === 0) {
    return null;
  }
  const reference = Date.parse(recuA);
  if (Number.isNaN(reference)) {
    return null;
  }
  let total = 0;
  for (const evenement of evenements) {
    total += reference - Date.parse(evenement.horodatage);
  }
  return Math.round(total / evenements.length);
}

/**
 * Un passage complet : enregistrement du jeton si besoin puis vidage de la
 * file par tranches. Absorbe TOUT (réseau, stockage, révocation) : le retour
 * décrit l'état, jamais d'exception vers l'appelant (le bandeau ne doit pas
 * casser la fiche mission).
 */
export async function synchroniserTerrain(
  deps: DepsMoteurSync,
): Promise<ResultatMoteurSync> {
  const jeton = await deps.lireJetonSync();
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
  const evenements = await deps.listerEvenements();
  if (evenements.length === 0) {
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
  let echec: 'reseau' | 'appareil-revoque' | 'authentification' | 'lot-trop-grand' | null = null;

  /** Traite une tranche ; 413 → découpage réactif en deux moitiés (jamais de boucle sur la même tranche). */
  const traiterTranche = async (tranche: EvenementSyncTerrain[]): Promise<boolean> => {
    const envoi = await deps.posterLot(jeton, tranche);
    if (!envoi.ok) {
      if (envoi.erreur === 'lot-trop-grand' && tranche.length > 1) {
        // La borne serveur a bougé sous nos pieds : on divise et on réessaie
        // — chaque moitié progresse indépendamment.
        const milieu = Math.ceil(tranche.length / 2);
        if (!(await traiterTranche(tranche.slice(0, milieu)))) {
          return false;
        }
        return traiterTranche(tranche.slice(milieu));
      }
      echec = envoi.erreur;
      return false;
    }

    const { reponse } = envoi;
    // Marquage : accepté ET déjà-connu (le serveur connaît) ; les rejets
    // RESTENT en file — ils seront re-proposés et re-journalisés, jamais
    // perdus ni supprimés localement.
    const clesTranche = new Set(tranche.map((evenement) => evenement.cle));
    const clesAConnaitre = reponse.resultats
      .filter((resultat) => resultat.statut !== 'rejeté' && clesTranche.has(resultat.cle))
      .map((resultat) => resultat.cle);
    await deps.marquerEnvoyes(clesAConnaitre);

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
        // L'offset se juge sur les événements que le serveur CONNAÎT.
        tranche.filter((evenement) => clesAConnaitre.includes(evenement.cle)),
      ),
    });

    lots += 1;
    envoyes += reponse.compteurs.acceptes;
    dejaConnus += reponse.compteurs.dejaConnus;
    rejetes += reponse.compteurs.rejetes;
    return true;
  };

  for (const tranche of decouperEnTranches(evenements, SYNC_TERRAIN_MAX_LOT)) {
    if (!(await traiterTranche(tranche))) {
      // Révoqué : STOP net, rien n'est marqué — « Appelle le PC » (AD-5).
      // Jeton inconnu : l'enregistrement repassera à la prochaine ouverture.
      // Réseau (ou 413 insécable sur un événement seul) : rien n'est perdu,
      // le prochain déclenchement reprend ici.
      const statut: StatutMoteurSync =
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

// ---------------------------------------------------------------------------
// Câblage réel (navigateur) : fetch + IndexedDB. Les tests purs injectent
// leurs propres deps — ces helpers ne font qu'assembler.
// ---------------------------------------------------------------------------

function estReponseLotSyncValide(valeur: unknown): valeur is ReponseLotSync {
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
        STATUTS_SYNC_TERRAIN.includes(
          (resultat as { statut?: unknown }).statut as (typeof STATUTS_SYNC_TERRAIN)[number],
        ),
    )
  );
}

/** Poster un lot par Bearer appareil : mappe réseau/401/413 en états du moteur. */
export function creerPosterLotSync(
  fetchImpl: typeof fetch,
  baseUrl = '',
): (jeton: string, evenements: EvenementSyncTerrain[]) => Promise<ReponsePosterLot> {
  return async (jeton, evenements) => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/api/volontaires/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ evenements }),
        cache: 'no-store',
        // Une requête suspendue ne bloque pas la file à vie (paradigme annuaire).
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return { ok: false, erreur: 'reseau' };
    }
    if (response.status === 401) {
      const corps = await response.json().catch(() => null);
      const code = isErrorEnvelope(corps) ? corps.error.code : '';
      if (code === 'volontaires.sync.appareil_revoked') {
        return { ok: false, erreur: 'appareil-revoque' };
      }
      return { ok: false, erreur: 'authentification' };
    }
    if (response.status === 413) {
      // Lot (ou corps) trop grand : le moteur découpe et réessaie.
      return { ok: false, erreur: 'lot-trop-grand' };
    }
    if (!response.ok) {
      // 5xx (ou 4xx inattendu) : réessayable plus tard, rien de perdu.
      return { ok: false, erreur: 'reseau' };
    }
    const corps = await response.json().catch(() => null);
    return estReponseLotSyncValide(corps)
      ? { ok: true, reponse: corps }
      : { ok: false, erreur: 'reseau' };
  };
}

/** Deps réelles du moteur : IndexedDB (poche volontaires) + fetch. */
export function creerDepsSyncTerrain(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): DepsMoteurSync {
  return {
    lireJetonSync: () => lireJetonSync(),
    listerEvenements: () => listerEvenementsASynchroniser(),
    marquerEnvoyes: (cles) => marquerEnvoyes(cles),
    ajouterEntreeJournal: (entree) => ajouterEntreeJournal(entree),
    compterEnAttente: () => compterEnAttente(),
    posterLot: creerPosterLotSync(fetchImpl),
  };
}

// ---------------------------------------------------------------------------
// Enregistrement de l'appareil (session volontaire) puis relance — extraits
// testables : l'orchestration est pure, seul le câblage touche IDB/fetch.
// ---------------------------------------------------------------------------

/** Dépendances de l'enregistrement (injectées dans les tests). */
export interface DepsEnregistrementAppareil {
  lireAppareilId(): Promise<string | null>;
  enregistrerJeton(jeton: string): Promise<boolean>;
  fetchImpl: typeof fetch;
}

/** Résultat : true (enregistré), false (différé), 'revoque' (Appelle le PC). */
export type ResultatEnregistrement = boolean | 'revoque';

export function creerDepsEnregistrementAppareil(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): DepsEnregistrementAppareil {
  return {
    lireAppareilId: () => obtenirAppareilId(),
    enregistrerJeton: (jeton) => enregistrerJetonSync(jeton),
    fetchImpl,
  };
}

/**
 * Enregistrement de l'appareil au canal sync (session volontaire requise) :
 * appelé à l'ouverture en ligne quand le jeton manque. False sans exception
 * (hors-ligne, session morte, stockage refusé) : différé, la file reste
 * affichée. Un 401 « appareil révoqué » remonte 'revoque' — le bandeau
 * affiche « Appelle le PC », JAMAIS de boucle de réenregistrement (AD-5).
 */
export async function enregistrerAppareilPourSync(
  deps: DepsEnregistrementAppareil = creerDepsEnregistrementAppareil(),
): Promise<ResultatEnregistrement> {
  const appareilId = await deps.lireAppareilId();
  if (appareilId === null) {
    return false;
  }
  try {
    const response = await deps.fetchImpl('/api/volontaires/appareil', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appareilId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401) {
      const corps = await response.json().catch(() => null);
      if (isErrorEnvelope(corps) && corps.error.code === 'volontaires.sync.appareil_revoked') {
        return 'revoque';
      }
      return false;
    }
    if (!response.ok) {
      return false;
    }
    const corps = (await response.json().catch(() => null)) as { jeton?: unknown } | null;
    if (typeof corps?.jeton !== 'string' || corps.jeton.length === 0) {
      return false;
    }
    return await deps.enregistrerJeton(corps.jeton);
  } catch {
    return false;
  }
}

/**
 * Orchestration register-then-retry (pure, testée) : sans-jeton →
 * enregistrement → nouvelle tentative. L'enregistrement révoqué court-circuite
 * en « appareil-revoque » ; un échec simple rend le résultat initial (la file
 * reste affichée, la prochaine ouverture réessaiera).
 */
export async function synchroniserTerrainAvecEnregistrement(
  deps: DepsMoteurSync & { enregistrer: () => Promise<ResultatEnregistrement> },
): Promise<ResultatMoteurSync> {
  const resultat = await synchroniserTerrain(deps);
  if (resultat.statut !== 'sans-jeton') {
    return resultat;
  }
  const enregistrement = await deps.enregistrer();
  if (enregistrement === 'revoque') {
    return { ...resultat, statut: 'appareil-revoque' };
  }
  if (enregistrement === true) {
    return synchroniserTerrain(deps);
  }
  return resultat;
}
