import type { EntreeJournalSync } from './outbox-sqlite';
import type { EtatSuivi, PermissionsLues } from './moteur';
import { classierPermission } from './permission';

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
  /**
   * 6.3 — reprise SANS demande de permission (watcher direct, permissions
   * déjà lues accordées via get*) : AUCUN pop-up système au retour au
   * premier plan — les demandes restent déclenchées par le toggle opt-in.
   */
  demarrerSansDemande(arrierePlanAccordee: boolean): Promise<EtatSuivi>;
  arreterMoteur(): void;
  /**
   * 6.3 — lecture NON INTRUSIVE des permissions (get* sans request*,
   * aucun pop-up) : uniquement au retour au premier plan, opt-in actif.
   */
  lirePermissions(): Promise<PermissionsLues>;
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

/** Résultat de la reprise 6.3 au retour au premier plan. */
export interface ResultatReprisePremierPlan {
  miseAJour: MiseAJourSuivi;
  /**
   * true → l'app doit afficher l'écran guide AUTOMATIQUEMENT. N'est émis
   * qu'UNE fois par interruption (anti-harcèlement) : les retours suivants
   * tant que la permission manque ne re-demandent PAS l'affichage.
   */
  afficherGuide: boolean;
}

/**
 * 6.3 — reprise au retour au premier plan, piège iOS « Autoriser une
 * fois » : lecture NON intrusive des permissions (get*, jamais request*)
 * PUIS classification pure →
 * - opt-in désactivé → AUCUNE lecture, AUCUN guide, AUCUNE sync (« rien »
 *   littéral) ; préférence illisible → l'optIn AFFICHÉ n'est pas écrasé ;
 * - permission revenue (suivi arrêté) → watcher redémarré SEUL via
 *   demarrerSansDemande (aucun pop-up) + sync ; un démarrage échoué ou
 *   inactif CONSERVE l'état précédent (jamais prétendre « actif ») ;
 * - permission perdue alors que le suivi tournait → watcher mort arrêté,
 *   état 'interrompu' + affichage du guide UNE SEULE fois par
 *   interruption (les retours répétés sans changement restent sur
 *   l'état, sans re-guide) ;
 * - rétrogradation « Toujours » → « Pendant l'utilisation » → état
 *   remis à 'actif-avant-plan' (affichage honnête), sans guide ni arrêt ;
 * - jamais accordée → 'permission-refusee' silencieux, JAMAIS d'auto-guide ;
 * - tout allait déjà bien → sync seule, l'état ne bouge pas.
 * Le message d'erreur opt-in éventuel est effacé à chaque reprise.
 * L'état actuel est PASSÉ (fonction sans mémoire) : l'anti-répétition se
 * lit dessus — 'interrompu' déjà posé = guide déjà montré pour cette
 * interruption.
 */
export async function reprendreAuPremierPlan(
  ports: PortsOrchestrationSuivi,
  etatActuel: EtatSuiviApp,
): Promise<ResultatReprisePremierPlan> {
  let optIn: boolean | null = null;
  try {
    optIn = await ports.lireOptin();
  } catch {
    optIn = null;
  }
  if (optIn === null) {
    // Préférence illisible : on ne sait rien — l'optIn affiché (le vrai,
    // posé par le toggle) n'est PAS écrasé, aucune permission lue.
    return { miseAJour: { enAttente: compterSansEchec(ports) }, afficherGuide: false };
  }
  if (!optIn) {
    // Désactivé : aucune lecture de permission, aucun guide, aucune sync.
    return {
      miseAJour: { optIn: false, erreurOptin: null, enAttente: compterSansEchec(ports) },
      afficherGuide: false,
    };
  }
  let permissions: PermissionsLues | null = null;
  try {
    permissions = await ports.lirePermissions();
  } catch {
    permissions = null;
  }
  if (permissions === null) {
    // Lecture impossible (module natif absent, erreur Expo) : on ne
    // dérange pas le coureur — sync seule, l'état ne bouge pas.
    await ports.synchroniser();
    return { miseAJour: { erreurOptin: null, enAttente: compterSansEchec(ports) }, afficherGuide: false };
  }
  // Le suivi « tournait » = watcher réellement vivant avant l'arrière-plan
  // ('interrompu' est exclu : son watcher est déjà arrêté).
  const suiviTournait =
    etatActuel.etatMoteur === 'actif' || etatActuel.etatMoteur === 'actif-avant-plan';
  // Seul un suivi qui tournait AVEC l'arrière-plan peut être rétrogradé.
  const arrierePlanAvait = etatActuel.etatMoteur === 'actif';
  const verdict = classierPermission({
    optIn: true,
    suiviTournait,
    arrierePlanAvait,
    avantPlanAccordee: permissions.avantPlanAccordee,
    arrierePlanAccordee: permissions.arrierePlanAccordee,
  });
  switch (verdict) {
    case 'interrompu': {
      // Piège « Autoriser une fois » : le watcher natif est mort (plus
      // aucune livraison) — on le retire, on pose l'état et on guide UNE fois.
      ports.arreterMoteur();
      await ports.synchroniser();
      return {
        miseAJour: {
          optIn: true,
          etatMoteur: 'interrompu',
          enAttente: compterSansEchec(ports),
          erreurOptin: null,
        },
        afficherGuide: true,
      };
    }
    case 'retrograde': {
      // « Toujours » rétrogradé : le watcher vit, on AFFICHE la vérité
      // (avant-plan seul) — pas de guide, pas d'arrêt, pas de redémarrage.
      await ports.synchroniser();
      return {
        miseAJour: {
          optIn: true,
          etatMoteur: 'actif-avant-plan',
          enAttente: compterSansEchec(ports),
          erreurOptin: null,
        },
        afficherGuide: false,
      };
    }
    case 'refuse': {
      await ports.synchroniser();
      // Déjà interrompu : l'état RESTE 'interrompu' (le coureur avait un
      // suivi, le récit ne retombe pas sur « jamais autorisée ») et le
      // guide n'est PAS re-demandé — anti-harcèlement.
      return {
        miseAJour: {
          optIn: true,
          etatMoteur: etatActuel.etatMoteur === 'interrompu' ? 'interrompu' : 'permission-refusee',
          enAttente: compterSansEchec(ports),
          erreurOptin: null,
        },
        afficherGuide: false,
      };
    }
    case 'redemarrer': {
      // Permission revenue (ou refus rétabli) : le suivi REPART seul, SANS
      // demande (aucun pop-up — les demandes restent le fait du toggle).
      let demarre: EtatSuivi | null = null;
      try {
        demarre = await ports.demarrerSansDemande(permissions.arrierePlanAccordee);
      } catch {
        demarre = null;
      }
      await ports.synchroniser();
      const miseAJour: MiseAJourSuivi = { optIn: true, enAttente: compterSansEchec(ports), erreurOptin: null };
      // Un démarrage échoué ou inactif ne fait JAMAIS croire que le suivi
      // est actif : seul un état réellement démarré remplace l'affichage.
      if (demarre === 'actif' || demarre === 'actif-avant-plan') {
        miseAJour.etatMoteur = demarre;
      }
      return { miseAJour, afficherGuide: false };
    }
    case 'ok':
    default: {
      // Tout allait déjà bien : sync seule (les deferred updates iOS se
      // déversent justement au retour au premier plan), état inchangé.
      await ports.synchroniser();
      return { miseAJour: { optIn: true, erreurOptin: null, enAttente: compterSansEchec(ports) }, afficherGuide: false };
    }
  }
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
