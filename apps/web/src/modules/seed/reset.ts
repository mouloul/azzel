import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { readEnv } from '@/modules/iam/env';

/**
 * Story 8.3 — réinitialisation de l'environnement de recette.
 *
 * Le comité va expérimenter et casser des choses : cette commande ramène la
 * base à l'état que laissent les migrations, sans intervention en SQL et sans
 * toucher au schéma.
 *
 * **Rôle propriétaire obligatoire.** `azzel_app` ne dispose que de `SELECT` et
 * `INSERT` sur `terrain_evenement`, `abandon`, `annulation` et `position` :
 * `UPDATE` et `DELETE` lui sont révoqués (migrations 0025/0028/0029/0030). La
 * purge est donc IMPOSSIBLE sous le rôle applicatif — elle s'exécute sous
 * `DATABASE_OWNER_URL`, qui porte aussi BYPASSRLS (migration 0008) et traverse
 * donc les politiques FORCE RLS sans GUC d'organisation.
 *
 * **Ce qui est préservé :** tout ce que les migrations créent —
 * `organisation`, `evenement`, `edition`, `epreuve`, `document`,
 * `contenu_vitrine`, `schema_migrations`. Le seed les retrouve par slug, il ne
 * les réécrit jamais.
 *
 * **Garde-fou :** sans `AZZEL_SEED_RESET=1` dans l'environnement, la commande
 * refuse et nomme la variable. Inspecter le contenu de la base avant de purger
 * a été écarté : cela bloquerait une recette légitimement salie par le comité —
 * précisément le moment où la réinitialisation sert.
 */

export const RESET_ENV_NAME = 'AZZEL_SEED_RESET';

export const RESET_ENV_VALEUR_ATTENDUE = '1';

/**
 * Tables vidées, DES ENFANTS VERS LES PARENTS — l'ordre est celui des clés
 * étrangères, pas l'ordre alphabétique :
 *   annulation → terrain_evenement (FK composite)
 *   position   → appareil_coureur → account
 *   affectation → mission → secteur ; affectation → volontaire → account
 *   volontaire → email_outbox (invitation_outbox_id) ET account
 *   preuve → coureur → account
 *   resultats_visite, abandon → edition (conservée)
 */
export const TABLES_PURGEES = [
  'annulation',
  'terrain_evenement',
  'position',
  'appareil_coureur',
  'appareil',
  'abandon',
  'affectation',
  'mission',
  'secteur',
  'volontaire',
  'preuve',
  'coureur',
  'resultats_visite',
  'session',
  'login_code',
  'login_code_ip_request',
  'email_outbox',
  'temoignage',
  'vitrine_media_config',
  'sponsor',
  'vitrine_sponsors_config',
  'account',
] as const;

/** Tables que la purge ne touche JAMAIS : elles portent ce que les migrations créent. */
export const TABLES_PRESERVEES = [
  'organisation',
  'evenement',
  'edition',
  'epreuve',
  'document',
  'contenu_vitrine',
  'schema_migrations',
] as const;

export interface ResetRapport {
  /** Lignes supprimées par table, dans l'ordre de la purge. */
  suppressions: { table: string; lignes: number }[];
  /** Épreuves dont l'heure de départ a été remise à « non configurée ». */
  heuresDepartEffacees: number;
  total: number;
}

export class AutorisationResetManquanteError extends Error {
  constructor() {
    super(
      `Réinitialisation refusée : la variable ${RESET_ENV_NAME} est absente. ` +
        `Relance avec ${RESET_ENV_NAME}=${RESET_ENV_VALEUR_ATTENDUE} — la commande ` +
        'efface TOUTES les données de recette (coureurs, preuves, volontaires, ' +
        'missions, événements de course, comptes et sessions).',
    );
    this.name = 'AutorisationResetManquanteError';
  }
}

export class RoleProprietaireManquantError extends Error {
  constructor() {
    super(
      'DATABASE_OWNER_URL absente : la réinitialisation exige le rôle propriétaire. ' +
        'Le rôle applicatif azzel_app n’a ni UPDATE ni DELETE sur les tables ' +
        'append-only du chrono — la purge est impossible sous ce rôle. ' +
        'Voir .env.example.',
    );
    this.name = 'RoleProprietaireManquantError';
  }
}

/**
 * Purge sans effet alors que le rôle ne peut pas traverser les politiques
 * `FORCE RLS` : un `DELETE` hors GUC d'organisation ne voit alors AUCUNE ligne
 * et la commande annoncerait « base déjà vierge » en laissant tout en place.
 * Mieux vaut échouer que mentir.
 */
export class PurgeSansEffetError extends Error {
  constructor(role: string) {
    super(
      `Réinitialisation sans effet : le rôle « ${role} » n’a ni SUPERUSER ni BYPASSRLS. ` +
        'Les politiques FORCE RLS filtrent ses suppressions hors GUC d’organisation : ' +
        'aucune ligne n’a pu être supprimée. Connecte-toi avec le rôle propriétaire ' +
        'des tables (celui des migrations) — voir .env.example, DATABASE_OWNER_URL.',
    );
    this.name = 'PurgeSansEffetError';
  }
}

/** Vrai si l'autorisation explicite de purger est posée dans l'environnement. */
export function resetAutorise(): boolean {
  return readEnv(RESET_ENV_NAME) === RESET_ENV_VALEUR_ATTENDUE;
}

/**
 * Purge en UNE transaction : un échec à mi-chemin ne laisse pas la base dans
 * un état intermédiaire que le seed ne saurait pas rattraper.
 */
export async function executerReset(sql: postgres.Sql): Promise<ResetRapport> {
  const resultat = await sql.begin(async (tx) => {
    const suppressions: { table: string; lignes: number }[] = [];
    let total = 0;
    for (const table of TABLES_PURGEES) {
      const presente = await tx<{ existe: boolean }[]>`
        SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS existe
      `;
      if (!presente[0]?.existe) {
        continue;
      }
      const lignes = await tx.unsafe(`DELETE FROM ${table} RETURNING 1`);
      if (lignes.length > 0) {
        suppressions.push({ table, lignes: lignes.length });
        total += lignes.length;
      }
    }
    // L'heure de départ vit SUR l'épreuve, que la purge préserve : la remettre
    // à NULL rend l'édition « à configurer », comme au sortir des migrations.
    const heures = await tx<{ id: string }[]>`
      UPDATE epreuve SET heure_depart = NULL WHERE heure_depart IS NOT NULL RETURNING id
    `;
    // Zéro ligne supprimée : soit la base est vraiment vierge, soit le rôle
    // s'est fait filtrer par FORCE RLS et n'a rien vu. Les deux cas se
    // distinguent par le privilège du rôle, pas par un SELECT (lui aussi filtré).
    if (total === 0) {
      const roles = await tx<{ nom: string; peutContourner: boolean }[]>`
        SELECT rolname AS nom, (rolsuper OR rolbypassrls) AS "peutContourner"
        FROM pg_roles WHERE rolname = current_user
      `;
      if (roles[0]?.peutContourner !== true) {
        throw new PurgeSansEffetError(roles[0]?.nom ?? 'inconnu');
      }
    }
    return { suppressions, heuresDepartEffacees: heures.length, total };
  });
  return resultat as ResetRapport;
}

export async function executerResetCli(): Promise<void> {
  if (!resetAutorise()) {
    console.error(new AutorisationResetManquanteError().message);
    process.exitCode = 1;
    return;
  }
  // La variable est EXIGÉE explicitement : `readDatabaseOwnerUrl()` sait la
  // dériver de DATABASE_URL en devinant le rôle, et une purge ne se lance pas
  // sur une URL devinée.
  const ownerUrl = readEnv('DATABASE_OWNER_URL');
  if (!ownerUrl) {
    console.error(new RoleProprietaireManquantError().message);
    process.exitCode = 1;
    return;
  }
  const sql = postgres(ownerUrl, { max: 1, connect_timeout: 5, prepare: false });
  try {
    const rapport = await executerReset(sql);
    if (rapport.total === 0 && rapport.heuresDepartEffacees === 0) {
      console.info('Base déjà vierge : aucune donnée de recette à supprimer.');
    } else {
      for (const suppression of rapport.suppressions) {
        console.info(`${suppression.table} : ${suppression.lignes} ligne(s) supprimée(s).`);
      }
      console.info(
        `Total : ${rapport.total} ligne(s) supprimée(s), ${rapport.heuresDepartEffacees} heure(s) de départ effacée(s).`,
      );
    }
    console.info(
      `Préservé (créé par les migrations) : ${TABLES_PRESERVEES.join(', ')}.`,
    );
    console.info('Relance pnpm -F @azzel/web seed pour repeupler l’édition.');
  } catch (error) {
    console.error('Réinitialisation échouée :', error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invokedDirectly = (() => {
  if (typeof process.argv[1] !== 'string') {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  void executerResetCli().catch((error) => {
    console.error('seed:reset a échoué :', error);
    process.exitCode = 1;
  });
}
