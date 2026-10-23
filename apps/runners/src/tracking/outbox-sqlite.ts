import * as SQLite from 'expo-sqlite';
import { JOURNAL_SUIVI_MAX_ENTREES, cleIdempotencePosition, type PositionTerrain } from '@azzel/shared';

// Story 6.2 — outbox SQLite du suivi GPS : append-only STRICT. Les positions
// capturées vivent dans `positions` (cle PRIMARY KEY — INSERT OR IGNORE : le
// doublon d'un même tick est un no-op physique), le marquage d'envoi vit
// dans une table SÉPARÉE `envoyees` (l'append-only n'est jamais réécrit),
// le journal sync (lots, rejets, offsets horloge) est BORNÉ à
// JOURNAL_SUIVI_MAX_ENTREES entrées. Rejouable après échec : rien n'est jamais
// supprimé hors purge explicite (logout / changement de compte).

/** Position en file d'envoi (cle = clé d'idempotence du contrat shared). */
export interface PositionOutbox {
  cle: string;
  lat: number;
  lon: number;
  capteA: string;
}

/** Entrée du journal sync (lecture seule, bornée). */
export interface EntreeJournalSync {
  id: number;
  horodatage: string;
  envoyes: number;
  dejaConnus: number;
  rejetes: number;
  motifs: string[];
  offsetMoyenMs: number | null;
}

/** Sous-ensemble de SQLiteDatabase utilisé — mockable in-file (tests node). */
export interface BddSqlite {
  execSync(source: string): unknown;
  runSync(source: string, params?: unknown[]): { changes: number; lastInsertRowId: number };
  getAllSync<T>(source: string, params?: unknown[]): T[];
  getFirstSync<T>(source: string, params?: unknown[]): T | null;
}

const NOM_BASE = 'azzel-suivi.db';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS positions (
    cle TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    capte_a TEXT NOT NULL,
    ajoute_a TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS envoyees (cle TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    horodatage TEXT NOT NULL,
    envoyes INTEGER NOT NULL,
    deja_connus INTEGER NOT NULL,
    rejetes INTEGER NOT NULL,
    motifs TEXT NOT NULL,
    offset_moyen_ms INTEGER
  );
`;

export interface OutboxSuivi {
  initialiser(): void;
  /** Append-only : INSERT OR IGNORE par clé — true si réellement insérée. */
  enregistrerPosition(appareilId: string, position: PositionTerrain): boolean;
  /** Positions en attente (les envoyées exclues), ordre d'ajout. */
  listerEnAttente(limite: number): PositionOutbox[];
  marquerEnvoyees(cles: string[]): void;
  compterEnAttente(): number;
  ajouterEntreeJournal(entree: Omit<EntreeJournalSync, 'id'>): void;
  lireJournal(): EntreeJournalSync[];
  /** Purge explicite (logout / changement de compte) — jamais ailleurs. */
  purgerOutbox(): void;
}

export function creerOutboxSqlite(
  ouvrir: () => BddSqlite = () =>
    SQLite.openDatabaseSync(NOM_BASE) as unknown as BddSqlite,
): OutboxSuivi {
  let bdd: BddSqlite | null = null;

  function db(): BddSqlite {
    if (bdd === null) {
      bdd = ouvrir();
      bdd.execSync(SCHEMA);
    }
    return bdd;
  }

  return {
    initialiser() {
      db();
    },

    enregistrerPosition(appareilId: string, position: PositionTerrain): boolean {
      const cle = cleIdempotencePosition(appareilId, position.capteA);
      const resultat = db().runSync(
        'INSERT OR IGNORE INTO positions (cle, lat, lon, capte_a, ajoute_a) VALUES (?, ?, ?, ?, ?)',
        [cle, position.lat, position.lon, position.capteA, new Date().toISOString()],
      );
      return resultat.changes > 0;
    },

    listerEnAttente(limite: number): PositionOutbox[] {
      return db().getAllSync<{
        cle: string;
        lat: number;
        lon: number;
        capte_a: string;
      }>(
        `SELECT cle, lat, lon, capte_a FROM positions
         WHERE cle NOT IN (SELECT cle FROM envoyees)
         ORDER BY ajoute_a ASC, cle ASC
         LIMIT ?`,
        [limite],
      ).map((ligne) => ({ cle: ligne.cle, lat: ligne.lat, lon: ligne.lon, capteA: ligne.capte_a }));
    },

    marquerEnvoyees(cles: string[]): void {
      if (cles.length === 0) {
        return;
      }
      const base = db();
      // Table séparée : la ligne `positions` reste INTACTE (append-only).
      for (const cle of cles) {
        base.runSync('INSERT OR IGNORE INTO envoyees (cle) VALUES (?)', [cle]);
      }
    },

    compterEnAttente(): number {
      const ligne = db().getFirstSync<{ total: number }>(
        `SELECT COUNT(*) AS total FROM positions
         WHERE cle NOT IN (SELECT cle FROM envoyees)`,
      );
      return ligne?.total ?? 0;
    },

    ajouterEntreeJournal(entree: Omit<EntreeJournalSync, 'id'>): void {
      const base = db();
      base.runSync(
        `INSERT INTO journal (horodatage, envoyes, deja_connus, rejetes, motifs, offset_moyen_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          entree.horodatage,
          entree.envoyes,
          entree.dejaConnus,
          entree.rejetes,
          JSON.stringify(entree.motifs),
          entree.offsetMoyenMs,
        ],
      );
      // Journal BORNÉ : les plus vieilles entrées au-delà de la borne sautent.
      base.runSync(
        `DELETE FROM journal WHERE id NOT IN (
           SELECT id FROM journal ORDER BY id DESC LIMIT ?
         )`,
        [JOURNAL_SUIVI_MAX_ENTREES],
      );
    },

    lireJournal(): EntreeJournalSync[] {
      return db()
        .getAllSync<{
          id: number;
          horodatage: string;
          envoyes: number;
          deja_connus: number;
          rejetes: number;
          motifs: string;
          offset_moyen_ms: number | null;
        }>('SELECT id, horodatage, envoyes, deja_connus, rejetes, motifs, offset_moyen_ms FROM journal ORDER BY id DESC')
        .map((ligne) => {
          let motifs: string[] = [];
          try {
            const parses = JSON.parse(ligne.motifs) as unknown;
            if (Array.isArray(parses)) {
              motifs = parses.filter((motif): motif is string => typeof motif === 'string');
            }
          } catch {
            motifs = [];
          }
          return {
            id: ligne.id,
            horodatage: ligne.horodatage,
            envoyes: ligne.envoyes,
            dejaConnus: ligne.deja_connus,
            rejetes: ligne.rejetes,
            motifs,
            offsetMoyenMs: ligne.offset_moyen_ms,
          };
        });
    },

    purgerOutbox(): void {
      const base = db();
      base.runSync('DELETE FROM positions');
      base.runSync('DELETE FROM envoyees');
      base.runSync('DELETE FROM journal');
    },
  };
}

/** Outbox réelle de l'app (base azzel-suivi.db, ouverte paresseusement). */
export const outboxSuivi: OutboxSuivi = creerOutboxSqlite();
