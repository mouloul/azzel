import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ETAT_SUIVI_INITIAL,
  basculerOptin,
  changerDeCompte,
  deconnecterSuivi,
  initialiserSuivi,
  lireJournalSuivi,
  reprendreAuPremierPlan,
  type EtatSuiviApp,
  type PortsOrchestrationSuivi,
} from './orchestration-suivi';
import type { EtatSuivi, PermissionsLues } from './moteur';
import type { EntreeJournalSync } from './outbox-sqlite';

// Story 6.2 (revue) — tests de l'orchestration du suivi, ports entièrement
// injectés (pattern orchestration.ts 6.1) : (a) toggle off → moteur.arrêtré,
// (b) logout → arreter + purgerSuivi + reset, (c) démarrage → demarrer
// SEULEMENT si opt-in, (d) changement de compte → purge AVANT nouvelle
// capture avec moteur stoppé, (e) purge outbox en échec → erreur remontée.
// Story 6.3 — reprendreAuPremierPlan : piège « Autoriser une fois »
// (interrompu + guide auto UNE fois par interruption), rétablissement
// (redémarrage SANS demande — aucun pop-up), rétrogradation « Toujours »
// (état honnête sans guide), refus net (silencieux, jamais d'auto-guide),
// opt-in off (aucune lecture de permission), états périmés conservés.

interface OptionsPorts {
  optinInitial?: boolean;
  purgeOk?: boolean;
  /** Permissions renvoyées par le port de lecture non intrusive (6.3). */
  permissions?: PermissionsLues;
}

function creerPorts(options: OptionsPorts = {}) {
  const ports = {
    lireOptin: vi.fn(async () => options.optinInitial ?? false),
    ecrireOptin: vi.fn(async (_actif: boolean) => true),
    demarrerMoteur: vi.fn(async (): Promise<EtatSuivi> => 'actif'),
    demarrerSansDemande: vi.fn(async (): Promise<EtatSuivi> => 'actif'),
    arreterMoteur: vi.fn(),
    lirePermissions: vi.fn(
      async (): Promise<PermissionsLues> =>
        options.permissions ?? { avantPlanAccordee: true, arrierePlanAccordee: true },
    ),
    lireJournal: vi.fn((): EntreeJournalSync[] => []),
    compterEnAttente: vi.fn(() => 3),
    synchroniser: vi.fn(async () => {}),
    purgerSuivi: vi.fn(async () => options.purgeOk ?? true),
  };
  return ports;
}

function etatSuivi(etatMoteur: EtatSuivi, optIn = true): EtatSuiviApp {
  return { ...ETAT_SUIVI_INITIAL, optIn, etatMoteur };
}

const JOURNAL: EntreeJournalSync[] = [
  { id: 1, horodatage: '2027-05-16T07:13:00.000Z', envoyes: 2, dejaConnus: 0, rejetes: 0, motifs: [], offsetMoyenMs: 100 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('(c) démarrage — demarrer SEULEMENT si opt-in', () => {
  it('opt-in lu à false : AUCUN démarrage, AUCUNE sync, état désactivé', async () => {
    const ports = creerPorts({ optinInitial: false });
    const maj = await initialiserSuivi(ports);
    expect(maj.optIn).toBe(false);
    expect(ports.demarrerMoteur).not.toHaveBeenCalled();
    expect(ports.synchroniser).not.toHaveBeenCalled();
    expect(maj.enAttente).toBe(3);
  });

  it('opt-in lu à true : watcher démarré + sync déclenchée', async () => {
    const ports = creerPorts({ optinInitial: true });
    const maj = await initialiserSuivi(ports);
    expect(ports.demarrerMoteur).toHaveBeenCalledTimes(1);
    expect(ports.synchroniser).toHaveBeenCalledTimes(1);
    expect(maj.optIn).toBe(true);
    expect(maj.etatMoteur).toBe('actif');
  });

  it('rejet du démarrage moteur : état inactif, l’app ne crashe pas', async () => {
    const ports = creerPorts({ optinInitial: true });
    ports.demarrerMoteur = vi.fn(async () => {
      throw new Error('watcher KO');
    });
    const maj = await initialiserSuivi(ports);
    expect(maj.etatMoteur).toBe('inactif');
  });
});

describe('(a) toggle opt-in', () => {
  it('OFF : moteur arrêté, AUCUNE nouvelle sync, préférence posée à false', async () => {
    const ports = creerPorts({ optinInitial: true });
    const maj = await basculerOptin(ports, false);
    expect(ports.ecrireOptin).toHaveBeenCalledWith(false);
    expect(ports.arreterMoteur).toHaveBeenCalledTimes(1);
    expect(ports.synchroniser).not.toHaveBeenCalled();
    expect(maj.optIn).toBe(false);
    expect(maj.etatMoteur).toBe('inactif');
  });

  it('ON : préférence posée, watcher démarré, sync immédiate', async () => {
    const ports = creerPorts();
    const maj = await basculerOptin(ports, true);
    expect(ports.ecrireOptin).toHaveBeenCalledWith(true);
    expect(ports.demarrerMoteur).toHaveBeenCalledTimes(1);
    expect(ports.synchroniser).toHaveBeenCalledTimes(1);
    expect(maj.optIn).toBe(true);
    expect(maj.etatMoteur).toBe('actif');
  });

  it('échec d’écriture de la préférence : message + optIn INTACT (toggle réel)', async () => {
    const ports = creerPorts({ optinInitial: true });
    ports.ecrireOptin = vi.fn(async () => false);
    const maj = await basculerOptin(ports, false);
    expect(maj.erreurOptin).toContain('mémoriser');
    expect('optIn' in maj).toBe(false);
    expect(ports.arreterMoteur).not.toHaveBeenCalled();
    expect(ports.demarrerMoteur).not.toHaveBeenCalled();
  });

  it('état avant-plan distinct : remonté tel quel à l’écran', async () => {
    const ports = creerPorts();
    ports.demarrerMoteur = vi.fn(async (): Promise<EtatSuivi> => 'actif-avant-plan');
    const maj = await basculerOptin(ports, true);
    expect(maj.etatMoteur).toBe('actif-avant-plan');
  });
});

describe('6.3 reprendreAuPremierPlan — piège « Autoriser une fois »', () => {
  it('opt-in désactivé : permission JAMAIS lue, aucun guide, aucune sync', async () => {
    const ports = creerPorts({ optinInitial: false });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('inactif', false));
    expect(ports.lirePermissions).not.toHaveBeenCalled();
    expect(ports.demarrerMoteur).not.toHaveBeenCalled();
    expect(ports.demarrerSansDemande).not.toHaveBeenCalled();
    expect(ports.synchroniser).not.toHaveBeenCalled();
    expect(resultat.afficherGuide).toBe(false);
    expect(resultat.miseAJour.optIn).toBe(false);
    expect(resultat.miseAJour.erreurOptin).toBeNull();
  });

  it('préférence opt-in illisible : optIn AFFICHÉ préservé (champ omis), rien d’autre', async () => {
    const ports = creerPorts({ optinInitial: true });
    ports.lireOptin = vi.fn(async () => {
      throw new Error('storage');
    });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('actif'));
    expect(ports.lirePermissions).not.toHaveBeenCalled();
    expect('optIn' in resultat.miseAJour).toBe(false);
    expect('etatMoteur' in resultat.miseAJour).toBe(false);
    expect(resultat.afficherGuide).toBe(false);
  });

  it('le message d’erreur optin est EFFACÉ à chaque reprise (pas de persistance)', async () => {
    const ports = creerPorts({ optinInitial: true });
    const resultat = await reprendreAuPremierPlan(ports, {
      ...etatSuivi('actif'),
      erreurOptin: 'ancien message',
    });
    expect(resultat.miseAJour.erreurOptin).toBeNull();
  });

  it('suivi qui tournait + permission perdue → watcher arrêté, état interrompu, guide AUTO', async () => {
    const ports = creerPorts({
      optinInitial: true,
      permissions: { avantPlanAccordee: false, arrierePlanAccordee: false },
    });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('actif'));
    expect(ports.arreterMoteur).toHaveBeenCalledTimes(1);
    expect(ports.demarrerMoteur).not.toHaveBeenCalled();
    expect(ports.demarrerSansDemande).not.toHaveBeenCalled();
    expect(resultat.miseAJour.etatMoteur).toBe('interrompu');
    expect(resultat.afficherGuide).toBe(true);
    // La file tente quand même de partir (la sync dépend du RÉSEAU, pas de la permission).
    expect(ports.synchroniser).toHaveBeenCalledTimes(1);
  });

  it('idem depuis l’état avant-plan seul (« Autoriser une fois » en séance) → interrompu', async () => {
    const ports = creerPorts({
      optinInitial: true,
      permissions: { avantPlanAccordee: false, arrierePlanAccordee: false },
    });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('actif-avant-plan'));
    expect(resultat.miseAJour.etatMoteur).toBe('interrompu');
    expect(resultat.afficherGuide).toBe(true);
  });

  it('3 retours, toujours interrompu : guide UNE seule fois, l’état reste interrompu (anti-harcèlement)', async () => {
    const ports = creerPorts({
      optinInitial: true,
      permissions: { avantPlanAccordee: false, arrierePlanAccordee: false },
    });
    const premier = await reprendreAuPremierPlan(ports, etatSuivi('actif'));
    expect(premier.afficherGuide).toBe(true);
    // Les retours suivants partent de l'état 'interrompu' posé par le premier.
    const second = await reprendreAuPremierPlan(ports, etatSuivi('interrompu'));
    const troisieme = await reprendreAuPremierPlan(ports, etatSuivi('interrompu'));
    expect(second.afficherGuide).toBe(false);
    expect(troisieme.afficherGuide).toBe(false);
    expect(second.miseAJour.etatMoteur).toBe('interrompu');
    expect(troisieme.miseAJour.etatMoteur).toBe('interrompu');
    // Le watcher mort n'est pas ré-arrêté en boucle, aucun démarrage.
    expect(ports.arreterMoteur).toHaveBeenCalledTimes(1);
    expect(ports.demarrerSansDemande).not.toHaveBeenCalled();
  });

  it('permission rétablie après interruption → watcher repart SANS demande (aucun pop-up), guide disparaît', async () => {
    const ports = creerPorts({
      optinInitial: true,
      permissions: { avantPlanAccordee: true, arrierePlanAccordee: true },
    });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('interrompu'));
    // AUCUN demarrerMoteur (request* = pop-up interdit ici) : reprise via
    // demarrerSansDemande, avec l'arrière-plan tel que lu.
    expect(ports.demarrerSansDemande).toHaveBeenCalledTimes(1);
    expect(ports.demarrerSansDemande).toHaveBeenCalledWith(true);
    expect(ports.demarrerMoteur).not.toHaveBeenCalled();
    expect(ports.arreterMoteur).not.toHaveBeenCalled();
    expect(resultat.miseAJour.etatMoteur).toBe('actif');
    expect(resultat.afficherGuide).toBe(false);
    expect(ports.synchroniser).toHaveBeenCalledTimes(1);
  });

  it('démarrage sans demande qui ÉCHOUE : l’état précédent est conservé (jamais prétendu actif)', async () => {
    const ports = creerPorts({
      optinInitial: true,
      permissions: { avantPlanAccordee: true, arrierePlanAccordee: true },
    });
    ports.demarrerSansDemande = vi.fn(async () => {
      throw new Error('watcher KO');
    });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('interrompu'));
    expect('etatMoteur' in resultat.miseAJour).toBe(false);
    expect(ports.demarrerMoteur).not.toHaveBeenCalled();
    expect(resultat.afficherGuide).toBe(false);
  });

  it('démarrage sans demande qui retourne un état INACTIF : conservé aussi', async () => {
    const ports = creerPorts({
      optinInitial: true,
      permissions: { avantPlanAccordee: true, arrierePlanAccordee: true },
    });
    ports.demarrerSansDemande = vi.fn(async (): Promise<EtatSuivi> => 'inactif');
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('interrompu'));
    expect('etatMoteur' in resultat.miseAJour).toBe(false);
  });

  it('rétrogradation « Toujours » → « Pendant l’utilisation » : état honnête actif-avant-plan, SANS guide ni arrêt ni redémarrage', async () => {
    const ports = creerPorts({
      optinInitial: true,
      permissions: { avantPlanAccordee: true, arrierePlanAccordee: false },
    });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('actif'));
    expect(resultat.miseAJour.etatMoteur).toBe('actif-avant-plan');
    expect(resultat.afficherGuide).toBe(false);
    expect(ports.arreterMoteur).not.toHaveBeenCalled();
    expect(ports.demarrerSansDemande).not.toHaveBeenCalled();
    expect(ports.synchroniser).toHaveBeenCalledTimes(1);
  });

  it('déjà actif-avant-plan, toujours avant-plan seul : état inchangé (situation normale)', async () => {
    const ports = creerPorts({
      optinInitial: true,
      permissions: { avantPlanAccordee: true, arrierePlanAccordee: false },
    });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('actif-avant-plan'));
    expect('etatMoteur' in resultat.miseAJour).toBe(false);
    expect(resultat.afficherGuide).toBe(false);
  });

  it('permission jamais accordée → silencieux permission-refusee, JAMAIS d’auto-guide', async () => {
    const ports = creerPorts({
      optinInitial: true,
      permissions: { avantPlanAccordee: false, arrierePlanAccordee: false },
    });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('permission-refusee'));
    expect(resultat.miseAJour.etatMoteur).toBe('permission-refusee');
    expect(resultat.afficherGuide).toBe(false);
    expect(ports.arreterMoteur).not.toHaveBeenCalled();
  });

  it('tout allait déjà bien (actif + permissions accordées) → sync seule, état inchangé', async () => {
    const ports = creerPorts({ optinInitial: true });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('actif'));
    expect(ports.demarrerMoteur).not.toHaveBeenCalled();
    expect(ports.demarrerSansDemande).not.toHaveBeenCalled();
    expect(ports.arreterMoteur).not.toHaveBeenCalled();
    expect('etatMoteur' in resultat.miseAJour).toBe(false);
    expect(resultat.afficherGuide).toBe(false);
    expect(ports.synchroniser).toHaveBeenCalledTimes(1);
  });

  it('échec de lecture des permissions → sync seule, état inchangé, aucun guide, pas de crash', async () => {
    const ports = creerPorts({ optinInitial: true });
    ports.lirePermissions = vi.fn(async () => {
      throw new Error('expo-location absent');
    });
    const resultat = await reprendreAuPremierPlan(ports, etatSuivi('actif'));
    expect(resultat.afficherGuide).toBe(false);
    expect('etatMoteur' in resultat.miseAJour).toBe(false);
    expect(ports.synchroniser).toHaveBeenCalledTimes(1);
  });
});

describe('journal', () => {
  it('lecture du journal via ports (ordre décroissant côté outbox)', () => {
    const ports = creerPorts();
    ports.lireJournal = vi.fn(() => JOURNAL);
    const maj = lireJournalSuivi(ports);
    expect(maj.journal).toEqual(JOURNAL);
  });

  it('échec de lecture : journal vide, pas de crash', () => {
    const ports = creerPorts();
    ports.lireJournal = vi.fn(() => {
      throw new Error('sqlite');
    });
    expect(lireJournalSuivi(ports).journal).toEqual([]);
  });
});

describe('(b) logout — arreter + purgerSuivi + reset', () => {
  it('watcher stoppé, purge totale, état réinitialisé, tout OK', async () => {
    const ports = creerPorts({ purgeOk: true });
    const resultat = await deconnecterSuivi(ports);
    expect(ports.arreterMoteur).toHaveBeenCalledTimes(1);
    expect(ports.purgerSuivi).toHaveBeenCalledTimes(1);
    expect(resultat.miseAJour).toEqual({ ...ETAT_SUIVI_INITIAL });
    expect(resultat.purgeOk).toBe(true);
    expect(resultat.erreur).toBeNull();
  });
});

describe('(e) purge outbox en échec — erreur remontée', () => {
  it('logout : purgeOk false + message honnête, l’état est quand même réinitialisé', async () => {
    const ports = creerPorts({ purgeOk: false });
    const resultat = await deconnecterSuivi(ports);
    expect(resultat.purgeOk).toBe(false);
    expect(resultat.erreur).toContain('Déconnexion incomplète');
    expect(resultat.miseAJour).toEqual({ ...ETAT_SUIVI_INITIAL });
  });
});

describe('(d) changement de compte — purge AVANT nouvelle capture, moteur stoppé', () => {
  it('arreter AVANT purge (ordre des appels), reset complet, aucune sync', async () => {
    const ports = creerPorts();
    const ordre: string[] = [];
    ports.arreterMoteur = vi.fn(() => ordre.push('arreter'));
    ports.purgerSuivi = vi.fn(async () => {
      ordre.push('purger');
      return true;
    });
    const resultat = await changerDeCompte(ports);
    expect(ordre).toEqual(['arreter', 'purger']);
    expect(ports.synchroniser).not.toHaveBeenCalled();
    expect(ports.demarrerMoteur).not.toHaveBeenCalled();
    expect(resultat.miseAJour.optIn).toBe(false);
    expect(resultat.purgeOk).toBe(true);
  });
});

describe('typage structurel des ports', () => {
  it('les ports mocks satisfont l’interface (compil + runtime)', () => {
    const ports: PortsOrchestrationSuivi = creerPorts();
    expect(typeof ports.lireOptin).toBe('function');
    expect(typeof ports.synchroniser).toBe('function');
  });
});
