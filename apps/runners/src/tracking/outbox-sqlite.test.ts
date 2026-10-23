import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JOURNAL_SUIVI_MAX_ENTREES, POSITION_SCHEMA_VERSION, type PositionTerrain } from '@azzel/shared';

import { creerOutboxSqlite, type BddSqlite } from './outbox-sqlite';

// Story 6.2 — tests de l'outbox SQLite (expo-sqlite mocké in-file par un mini
// moteur Map qui interprète les requêtes du module) : append-only INSERT OR
// IGNORE, marquage en table séparée, journal BORNÉ à 100 entrées, purge
// explicite. Aucune position hors contrat n'entre (garde partagée testée dans
// tracking.test.ts du shared — ici, la mécanique de stockage).

// ---------------------------------------------------------------------------
// Mini moteur SQL : interprète les requêtes ÉMISES par outbox-sqlite (formes
// figées par le module — toute dérive fait échouer le test, c'est voulu).
// ---------------------------------------------------------------------------

interface LignePosition {
  cle: string;
  lat: number;
  lon: number;
  capte_a: string;
  ajoute_a: string;
}

interface LigneJournal {
  id: number;
  horodatage: string;
  envoyes: number;
  deja_connus: number;
  rejetes: number;
  motifs: string;
  offset_moyen_ms: number | null;
}

class MiniSqlite implements BddSqlite {
  positions = new Map<string, LignePosition>();
  envoyees = new Set<string>();
  journal: LigneJournal[] = [];
  private sequence = 0;

  execSync(): unknown {
    return null;
  }

  runSync(source: string, params: unknown[] = []): { changes: number; lastInsertRowId: number } {
    if (source.startsWith('INSERT OR IGNORE INTO positions')) {
      const [cle, lat, lon, capteA, ajouteA] = params as [string, number, number, string, string];
      if (this.positions.has(cle)) {
        return { changes: 0, lastInsertRowId: 0 };
      }
      this.positions.set(cle, { cle, lat, lon, capte_a: capteA, ajoute_a: ajouteA });
      return { changes: 1, lastInsertRowId: 1 };
    }
    if (source.startsWith('INSERT OR IGNORE INTO envoyees')) {
      const [cle] = params as [string];
      const changes = this.envoyees.has(cle) ? 0 : 1;
      this.envoyees.add(cle);
      return { changes, lastInsertRowId: 1 };
    }
    if (source.startsWith('INSERT INTO journal')) {
      const [horodatage, envoyes, dejaConnus, rejetes, motifs, offsetMoyenMs] = params as [
        string,
        number,
        number,
        number,
        string,
        number | null,
      ];
      this.sequence += 1;
      this.journal.push({
        id: this.sequence,
        horodatage,
        envoyes,
        deja_connus: dejaConnus,
        rejetes,
        motifs,
        offset_moyen_ms: offsetMoyenMs,
      });
      return { changes: 1, lastInsertRowId: this.sequence };
    }
    if (source.startsWith('DELETE FROM journal WHERE id NOT IN')) {
      const [limite] = params as [number];
      this.journal = [...this.journal]
        .sort((a, b) => b.id - a.id)
        .slice(0, limite)
        .sort((a, b) => a.id - b.id);
      return { changes: 0, lastInsertRowId: 0 };
    }
    if (source.startsWith('DELETE FROM positions')) {
      this.positions.clear();
      return { changes: 0, lastInsertRowId: 0 };
    }
    if (source.startsWith('DELETE FROM envoyees')) {
      this.envoyees.clear();
      return { changes: 0, lastInsertRowId: 0 };
    }
    if (source.startsWith('DELETE FROM journal')) {
      this.journal = [];
      return { changes: 0, lastInsertRowId: 0 };
    }
    throw new Error(`MiniSqlite : runSync inattendu — ${source}`);
  }

  getAllSync<T>(source: string): T[] {
    if (source.startsWith('SELECT id, horodatage')) {
      return [...this.journal]
        .sort((a, b) => b.id - a.id)
        .map((ligne) => ({ ...ligne })) as unknown as T[];
    }
    throw new Error(`MiniSqlite : getAllSync inattendu — ${source}`);
  }

  getFirstSync<T>(source: string): T | null {
    if (source.startsWith('SELECT COUNT(*) AS total FROM positions')) {
      let total = 0;
      for (const cle of this.positions.keys()) {
        if (!this.envoyees.has(cle)) {
          total += 1;
        }
      }
      return { total } as unknown as T;
    }
    throw new Error(`MiniSqlite : getFirstSync inattendu — ${source}`);
  }
}

// La requête listerEnAttente porte sa limite en paramètre : le mini moteur la
// lit via une surcharge dédiée plutôt que dans getAllSync générique.
class MoteurAvecListe extends MiniSqlite {
  limiteListe = Number.MAX_SAFE_INTEGER;

  getAllSync<T>(source: string): T[] {
    if (source.startsWith('SELECT cle, lat, lon, capte_a FROM positions')) {
      const enAttente = [...this.positions.values()]
        .filter((ligne) => !this.envoyees.has(ligne.cle))
        .sort((a, b) => a.ajoute_a.localeCompare(b.ajoute_a) || a.cle.localeCompare(b.cle))
        .slice(0, this.limiteListe);
      return enAttente.map((ligne) => ({ ...ligne })) as unknown as T[];
    }
    return super.getAllSync<T>(source);
  }
}

vi.mock('expo-sqlite', () => ({ openDatabaseSync: () => moteur }));

const moteur = new MoteurAvecListe();

function position(surcharge: Partial<PositionTerrain> = {}): PositionTerrain {
  return {
    version: POSITION_SCHEMA_VERSION,
    lat: 36.712345,
    lon: 3.187654,
    capteA: '2027-05-16T07:05:09.000Z',
    ...surcharge,
  };
}

beforeEach(() => {
  moteur.positions.clear();
  moteur.envoyees.clear();
  moteur.journal = [];
  moteur.limiteListe = Number.MAX_SAFE_INTEGER;
});

describe('outbox SQLite — append-only', () => {
  it('enregistre une position : 1 ligne, clé appareil:capteA', () => {
    const outbox = creerOutboxSqlite(() => moteur);
    const inseree = outbox.enregistrerPosition('app-1', position());
    expect(inseree).toBe(true);
    expect(outbox.compterEnAttente()).toBe(1);
    expect(outbox.listerEnAttente(10)[0]?.cle).toBe(
      'position:v1:app-1:2027-05-16T07:05:09.000Z',
    );
  });

  it('deux ticks à 7 min d’intervalle : 2 lignes, clés DISTINCTES', () => {
    const outbox = creerOutboxSqlite(() => moteur);
    outbox.enregistrerPosition('app-1', position({ capteA: '2027-05-16T07:05:09.000Z' }));
    outbox.enregistrerPosition('app-1', position({ capteA: '2027-05-16T07:12:09.000Z' }));
    expect(outbox.compterEnAttente()).toBe(2);
  });

  it('doublon même capteA : INSERT OR IGNORE — no-op physique', () => {
    const outbox = creerOutboxSqlite(() => moteur);
    expect(outbox.enregistrerPosition('app-1', position())).toBe(true);
    expect(outbox.enregistrerPosition('app-1', position())).toBe(false);
    expect(outbox.compterEnAttente()).toBe(1);
  });

  it('deux appareils : clés distinctes, aucune collision', () => {
    const outbox = creerOutboxSqlite(() => moteur);
    outbox.enregistrerPosition('app-1', position());
    outbox.enregistrerPosition('app-2', position());
    expect(outbox.compterEnAttente()).toBe(2);
  });
});

describe('outbox SQLite — marquage en table séparée', () => {
  it('marquerEnvoyees exclut de la file SANS toucher aux lignes positions', () => {
    const outbox = creerOutboxSqlite(() => moteur);
    outbox.enregistrerPosition('app-1', position({ capteA: '2027-05-16T07:05:09.000Z' }));
    outbox.enregistrerPosition('app-1', position({ capteA: '2027-05-16T07:12:09.000Z' }));

    outbox.marquerEnvoyees(['position:v1:app-1:2027-05-16T07:05:09.000Z']);

    expect(outbox.compterEnAttente()).toBe(1);
    // La ligne d'origine reste INTACTE (append-only) :
    expect(moteur.positions.size).toBe(2);
    expect(outbox.listerEnAttente(10).map((p) => p.capteA)).toEqual(['2027-05-16T07:12:09.000Z']);
  });

  it('listerEnAttente borne la lecture (limite passée à la requête)', () => {
    const outbox = creerOutboxSqlite(() => moteur);
    outbox.enregistrerPosition('app-1', position({ capteA: '2027-05-16T07:05:09.000Z' }));
    outbox.enregistrerPosition('app-1', position({ capteA: '2027-05-16T07:12:09.000Z' }));
    outbox.enregistrerPosition('app-1', position({ capteA: '2027-05-16T07:19:09.000Z' }));
    moteur.limiteListe = 2;
    expect(outbox.listerEnAttente(2)).toHaveLength(2);
  });

  it('marquage idempotent : rejouer marquerEnvoyees ne casse rien', () => {
    const outbox = creerOutboxSqlite(() => moteur);
    outbox.enregistrerPosition('app-1', position());
    outbox.marquerEnvoyees(['position:v1:app-1:2027-05-16T07:05:09.000Z']);
    outbox.marquerEnvoyees(['position:v1:app-1:2027-05-16T07:05:09.000Z']);
    expect(outbox.compterEnAttente()).toBe(0);
  });
});

describe('outbox SQLite — journal borné', () => {
  it('ajoute puis lit les entrées (ordre décroissant, motifs relus)', () => {
    const outbox = creerOutboxSqlite(() => moteur);
    outbox.ajouterEntreeJournal({
      horodatage: '2027-05-16T07:13:00.000Z',
      envoyes: 2,
      dejaConnus: 1,
      rejetes: 0,
      motifs: [],
      offsetMoyenMs: 1200,
    });
    outbox.ajouterEntreeJournal({
      horodatage: '2027-05-16T07:20:00.000Z',
      envoyes: 0,
      dejaConnus: 0,
      rejetes: 1,
      motifs: ['position invalide'],
      offsetMoyenMs: null,
    });
    const journal = outbox.lireJournal();
    expect(journal).toHaveLength(2);
    expect(journal[0]?.horodatage).toBe('2027-05-16T07:20:00.000Z');
    expect(journal[0]?.motifs).toEqual(['position invalide']);
    expect(journal[1]?.offsetMoyenMs).toBe(1200);
  });

  it(`journal BORNÉ : au-delà de ${JOURNAL_SUIVI_MAX_ENTREES} entrées, les plus vieilles sautent`, () => {
    const outbox = creerOutboxSqlite(() => moteur);
    for (let index = 0; index < JOURNAL_SUIVI_MAX_ENTREES + 10; index += 1) {
      outbox.ajouterEntreeJournal({
        horodatage: new Date(Date.UTC(2027, 4, 16, 7, index)).toISOString(),
        envoyes: index,
        dejaConnus: 0,
        rejetes: 0,
        motifs: [],
        offsetMoyenMs: null,
      });
    }
    expect(outbox.lireJournal()).toHaveLength(JOURNAL_SUIVI_MAX_ENTREES);
    // Les DERNIÈRES entrées survivent (ordre décroissant : la plus récente en tête).
    expect(outbox.lireJournal()[0]?.envoyes).toBe(JOURNAL_SUIVI_MAX_ENTREES + 9);
  });
});

describe('outbox SQLite — purge explicite', () => {
  it('purgerOutbox vide positions, envoyées ET journal', () => {
    const outbox = creerOutboxSqlite(() => moteur);
    outbox.enregistrerPosition('app-1', position());
    outbox.marquerEnvoyees(['position:v1:app-1:2027-05-16T07:05:09.000Z']);
    outbox.ajouterEntreeJournal({
      horodatage: '2027-05-16T07:13:00.000Z',
      envoyes: 1,
      dejaConnus: 0,
      rejetes: 0,
      motifs: [],
      offsetMoyenMs: 0,
    });

    outbox.purgerOutbox();

    expect(outbox.compterEnAttente()).toBe(0);
    expect(outbox.lireJournal()).toEqual([]);
    expect(moteur.positions.size).toBe(0);
  });
});
