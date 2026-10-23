import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ETAT_SUIVI_INITIAL,
  basculerOptin,
  changerDeCompte,
  deconnecterSuivi,
  initialiserSuivi,
  lireJournalSuivi,
  revenirAuPremierPlan,
  type PortsOrchestrationSuivi,
} from './orchestration-suivi';
import type { EtatSuivi } from './moteur';
import type { EntreeJournalSync } from './outbox-sqlite';

// Story 6.2 (revue) — tests de l'orchestration du suivi, ports entièrement
// injectés (pattern orchestration.ts 6.1) : (a) toggle off → moteur.arrêtré,
// (b) logout → arreter + purgerSuivi + reset, (c) démarrage → demarrer
// SEULEMENT si opt-in, (d) changement de compte → purge AVANT nouvelle
// capture avec moteur stoppé, (e) purge outbox en échec → erreur remontée.

function creerPorts(options: { optinInitial?: boolean; purgeOk?: boolean } = {}) {
  const ports = {
    lireOptin: vi.fn(async () => options.optinInitial ?? false),
    ecrireOptin: vi.fn(async (_actif: boolean) => true),
    demarrerMoteur: vi.fn(async (): Promise<EtatSuivi> => 'actif'),
    arreterMoteur: vi.fn(),
    lireJournal: vi.fn((): EntreeJournalSync[] => []),
    compterEnAttente: vi.fn(() => 3),
    synchroniser: vi.fn(async () => {}),
    purgerSuivi: vi.fn(async () => options.purgeOk ?? true),
  };
  return ports;
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

describe('premier plan — rétablissement + sync', () => {
  it('opt-in actif : redémarrage (rétablissement permission) + sync', async () => {
    const ports = creerPorts({ optinInitial: true });
    await revenirAuPremierPlan(ports);
    expect(ports.demarrerMoteur).toHaveBeenCalledTimes(1);
    expect(ports.synchroniser).toHaveBeenCalledTimes(1);
  });

  it('désactivé : rien (aucune requête sync tant que non activé)', async () => {
    const ports = creerPorts({ optinInitial: false });
    const maj = await revenirAuPremierPlan(ports);
    expect(ports.synchroniser).not.toHaveBeenCalled();
    expect(maj.optIn).toBe(false);
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
