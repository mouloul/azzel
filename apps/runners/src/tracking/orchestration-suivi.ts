import type { EntreeJournalSync } from './outbox-sqlite';
import type { EtatSuivi } from './moteur';

// Story 6.2 (revue) — orchestration du suivi GPS : toute la logique de
// décision (toggle opt-in → start/stop, logout → stop+purge+reset,
// changement de compte → stop+purge AVANT nouvelle capture, premier plan →
// rétablissement+sync) vit ICI, ports injectés dans l'esprit de
// src/orchestration.ts (6.1) — App.tsx ne fait que câbler les états à
// l'écran Suivi. Règles portées :
// - désactivé = aucun watcher, aucune requête sync (spec 6.2 littérale) ;
// - échec d'écriture de la préférence → message + toggle à l'état réel ;
// - purge outbox en échec → signal remonté (déconnexion incomplète) ;
// - les erreurs des ports sont absorbées en états cohérents, jamais de
//   crash de l'écran.

export interface EtatSuiviApp {
  optIn: boolean;
  etatMoteur: EtatSuivi;
  enAttente: number;
  journal: EntreeJournalSync[];
  /** Message d'échec de mémorisation du toggle (l'écran l'affiche). */
  erreurOptin: string | null;
}

export const ETAT_SUIVI_INITIAL: EtatSuiviApp = {
  optIn: false,
  etatMoteur: 'inactif',
  enAttente: 0,
  journal: [],
  erreurOptin: null,
};

/** Mise à jour partielle appliquée par App.tsx sur son état suivi. */
export type MiseAJourSuivi = Partial<EtatSuiviApp>;

export interface PortsOrchestrationSuivi {
  lireOptin(): Promise<boolean>;
  /** false = écriture refusée (stockage) — le toggle reste à l'état réel. */
  ecrireOptin(actif: boolean): Promise<boolean>;
  demarrerMoteur(): Promise<EtatSuivi>;
  arreterMoteur(): void;
  lireJournal(): EntreeJournalSync[];
  compterEnAttente(): number;
  /** Un passage complet de sync (register-then-retry inclus). */
  synchroniser(): Promise<void>;
  /** Purge TOTALE (jeton + préférences + outbox) — false = outbox non purgée. */
  purgerSuivi(): Promise<boolean>;
}

/** Résultat d'une purge (logout / changement de compte). */
export interface ResultatPurgeSuivi {
  miseAJour: MiseAJourSuivi;
  /** false = la purge de l'outbox a échoué (déconnexion incomplète). */
  purgeOk: boolean;
  /** Message honnête à afficher quand la purge a échoué, sinon null. */
  erreur: string | null;
}

const MESSAGE_ERREUR_OPTIN =
  'Impossible de mémoriser ton choix sur ce téléphone. Réessaie — si ça persiste, appelle l’équipe.';

async function demarrerSansEchec(ports: PortsOrchestrationSuivi): Promise<EtatSuivi> {
  try {
    return await ports.demarrerMoteur();
  } catch {
    return 'inactif';
  }
}

function compterSansEchec(ports: PortsOrchestrationSuivi): number {
  try {
    return ports.compterEnAttente();
  } catch {
    return 0;
  }
}

/**
 * Démarrage de l'app : lecture de la préférence, démarrage du watcher
 * SEULEMENT si opt-in, sync (positions en attente → serveur). Sans opt-in :
 * aucun watcher, aucune requête — « désactivé : rien » est littéral.
 */
export async function initialiserSuivi(
  ports: PortsOrchestrationSuivi,
): Promise<MiseAJourSuivi> {
  let optIn = false;
  try {
    optIn = await ports.lireOptin();
  } catch {
    optIn = false;
  }
  if (!optIn) {
    return { optIn: false, erreurOptin: null, enAttente: compterSansEchec(ports) };
  }
  const etatMoteur = await demarrerSansEchec(ports);
  await ports.synchroniser();
  return { optIn: true, etatMoteur, enAttente: compterSansEchec(ports), erreurOptin: null };
}

/**
 * Retour au premier plan : rétablissement de permission (Réglages → repart
 * seul) + sync de la file. Toujours rien si désactivé.
 */
export async function revenirAuPremierPlan(
  ports: PortsOrchestrationSuivi,
): Promise<MiseAJourSuivi> {
  return initialiserSuivi(ports);
}

/**
 * Toggle opt-in : pose la préférence AVANT tout. Échec d'écriture → message,
 * l'état opt-in de l'écran ne bouge PAS (toggle ramené à l'état réel).
 * Activation → watcher + sync immédiate ; désactivation → watcher stoppé,
 * AUCUNE nouvelle requête.
 */
export async function basculerOptin(
  ports: PortsOrchestrationSuivi,
  actif: boolean,
): Promise<MiseAJourSuivi> {
  const ecrit = await ports.ecrireOptin(actif);
  if (!ecrit) {
    return { erreurOptin: MESSAGE_ERREUR_OPTIN };
  }
  if (actif) {
    const etatMoteur = await demarrerSansEchec(ports);
    await ports.synchroniser();
    return { optIn: true, etatMoteur, enAttente: compterSansEchec(ports), erreurOptin: null };
  }
  ports.arreterMoteur();
  return { optIn: false, etatMoteur: 'inactif', enAttente: compterSansEchec(ports), erreurOptin: null };
}

/** Journal sync (lecture seule) pour l'écran dédié. */
export function lireJournalSuivi(ports: PortsOrchestrationSuivi): MiseAJourSuivi {
  let journal: EntreeJournalSync[] = [];
  try {
    journal = ports.lireJournal();
  } catch {
    journal = [];
  }
  return { journal };
}

/**
 * Logout explicite : watcher stoppé, purge TOTALE, état réinitialisé. La
 * session est purgée par l'appelant DANS TOUS LES CAS — un échec de purge
 * outbox ne doit pas empêcher la déconnexion, mais il DOIT être dit.
 */
export async function deconnecterSuivi(
  ports: PortsOrchestrationSuivi,
): Promise<ResultatPurgeSuivi> {
  ports.arreterMoteur();
  const purgeOk = await ports.purgerSuivi();
  return {
    miseAJour: { ...ETAT_SUIVI_INITIAL },
    purgeOk,
    erreur: purgeOk
      ? null
      : 'Déconnexion incomplète : tes positions n’ont pas pu être effacées de ce téléphone — appelle l’équipe.',
  };
}

/**
 * Changement de compte (déjà détecté par l'orchestration 6.1) : watcher
 * stoppé et purge TOTALE AVANT toute nouvelle capture — l'état repart à
 * zéro (opt-in OFF : le nouveau coureur choisit lui-même).
 */
export async function changerDeCompte(
  ports: PortsOrchestrationSuivi,
): Promise<ResultatPurgeSuivi> {
  ports.arreterMoteur();
  const purgeOk = await ports.purgerSuivi();
  return { miseAJour: { ...ETAT_SUIVI_INITIAL }, purgeOk, erreur: null };
}
