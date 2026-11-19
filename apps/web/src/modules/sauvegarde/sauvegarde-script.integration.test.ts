import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LocalDiskProofStore } from '@/modules/inscriptions/proof-store';

import {
  closeAzzelTestDb,
  databaseUrl,
  integrationDbRequired,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  TEST_DATABASE,
  type AzzelTestConnections,
} from '@/test/integration-db';

import type { Manifeste } from './exporter';

// Story 12.2 — `scripts/sauvegarde.sh` lancé pour de vrai (base azzel_test,
// preuves dans un STORAGE_DIR temporaire, paire age jetable, destination =
// dossier temporaire ou remote rclone « :local: », battement = serveur HTTP
// local) : matrice I/O, modes, rétention et garde-fous au niveau du script.
//
// L'environnement du script est EXPLICITE (aucun héritage de process.env, que
// readEnv a peuplé avec le .env du dépôt) : seules les variables posées ici
// comptent, PROOF_STORAGE_DRIVER compris.

const RACINE_DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const SCRIPT = path.join(RACINE_DEPOT, 'scripts', 'sauvegarde.sh');
const PATH_ENFANT = ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH ?? '/usr/bin:/bin'].join(
  path.delimiter,
);
const PG_IMAGE = process.env.PG_IMAGE ?? 'postgres:17-alpine';
const MOTIF_ARCHIVE = /^azzel-\d{8}T\d{6}Z\.tar\.age$/;
const COMMANDES_REQUISES = ['docker', 'age', 'age-keygen', 'rclone', 'pnpm', 'node', 'curl'];

/** Environnement explicite d'un processus enfant (le type ProcessEnv exige NODE_ENV). */
function envEnfant(valeurs: Record<string, string>): NodeJS.ProcessEnv {
  return valeurs as NodeJS.ProcessEnv;
}

function outilsManquants(): string[] {
  const manquants = COMMANDES_REQUISES.filter(
    (commande) =>
      spawnSync('sh', ['-c', `command -v ${commande}`], { env: envEnfant({ PATH: PATH_ENFANT }) })
        .status !== 0,
  );
  if (!manquants.includes('docker')) {
    const info = spawnSync('docker', ['info'], {
      env: { ...process.env, PATH: PATH_ENFANT },
      timeout: 20_000,
    });
    if (info.status !== 0) {
      manquants.push('docker (démon injoignable)');
    }
  }
  return manquants;
}

function outilsDisponibles(): boolean {
  const manquants = outilsManquants();
  if (manquants.length === 0) {
    return true;
  }
  const message = `outil(s) absent(s) : ${manquants.join(', ')}`;
  if (integrationDbRequired()) {
    throw new Error(
      `intégration sauvegarde-script IMPOSSIBLE — ${message} (AZZEL_REQUIRE_DB est posée).`,
    );
  }
  console.warn(`intégration sauvegarde-script SKIPPÉE — ${message}`);
  return false;
}

/** Le script complète les variables absentes par le .env du dépôt. */
function envDepotDefinit(nom: string): boolean {
  const fichier = path.join(RACINE_DEPOT, '.env');
  if (!existsSync(fichier)) {
    return false;
  }
  return new RegExp(`^\\s*${nom}\\s*=\\s*\\S`, 'm').test(readFileSync(fichier, 'utf8'));
}

const testUrls = resolveTestDatabaseUrls('sauvegarde-script');
const actif = testUrls !== null && outilsDisponibles();

interface Execution {
  code: number | null;
  sortie: string;
}

function lancer(mode: string, env: Record<string, string>): Promise<Execution> {
  return new Promise((resoudre, rejeter) => {
    const enfant = spawn('bash', [SCRIPT, mode], { cwd: RACINE_DEPOT, env: envEnfant(env) });
    let sortie = '';
    enfant.stdout.on('data', (morceau: Buffer) => (sortie += morceau.toString()));
    enfant.stderr.on('data', (morceau: Buffer) => (sortie += morceau.toString()));
    enfant.on('error', rejeter);
    enfant.on('close', (code) => resoudre({ code, sortie }));
  });
}

/** `nombre` archives factices, datées d'octobre 2026 (toutes plus anciennes que la nouvelle). */
async function semerArchives(dossier: string, nombre: number): Promise<string[]> {
  await mkdir(dossier, { recursive: true });
  const noms = Array.from(
    { length: nombre },
    (_, index) => `azzel-202610${String(index + 1).padStart(2, '0')}T023000Z.tar.age`,
  );
  for (const nom of noms) {
    await writeFile(path.join(dossier, nom), 'ancienne archive');
  }
  return noms;
}

async function lister(dossier: string): Promise<string[]> {
  return existsSync(dossier) ? (await readdir(dossier)).sort() : [];
}

async function fichiersSous(dossier: string): Promise<string[]> {
  if (!existsSync(dossier)) {
    return [];
  }
  const entrees = await readdir(dossier, { recursive: true, withFileTypes: true });
  return entrees.filter((entree) => entree.isFile()).map((entree) => entree.name);
}

function sha256(octets: Buffer): string {
  return createHash('sha256').update(octets).digest('hex');
}

describe.skipIf(!actif)('sauvegarde — scripts/sauvegarde.sh de bout en bout', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  let connections: AzzelTestConnections | undefined;
  let owner: postgres.Sql;
  let racine: string;
  let stockage: string;
  let fichierCle: string;
  let destinataire: string;
  let serveur: Server;
  let urlBattement: string;
  const battements: string[] = [];
  let clePreuve = '';

  function environnement(
    destination: string,
    surcharges: Record<string, string | undefined> = {},
  ): Record<string, string> {
    const env: Record<string, string | undefined> = {
      PATH: PATH_ENFANT,
      HOME: process.env.HOME ?? racine,
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
      RCLONE_CONFIG: path.join(racine, 'rclone.conf'),
      DATABASE_OWNER_URL: databaseUrl(ownerUrl, TEST_DATABASE),
      AGE_RECIPIENT: destinataire,
      SAUVEGARDE_DESTINATION: destination,
      HEARTBEAT_URL_SAUVEGARDE: urlBattement,
      PROOF_STORAGE_DRIVER: 'disque',
      STORAGE_DIR: stockage,
      // Jour fixé hors dimanche : seul le cas dédié exerce la copie hebdo/.
      SAUVEGARDE_JOUR_ISO: '3',
      PG_IMAGE,
      ...surcharges,
    };
    for (const nom of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']) {
      if (process.env[nom]) {
        env[nom] = process.env[nom];
      }
    }
    return Object.fromEntries(
      Object.entries(env).filter((entree): entree is [string, string] => entree[1] !== undefined),
    );
  }

  /** Déchiffre l'archive avec la clé privée du test, dans un dossier neuf. */
  async function dechiffrer(archive: string): Promise<string> {
    const cible = await mkdtemp(path.join(racine, 'clair-'));
    const resultat = spawnSync(
      'bash',
      ['-c', 'age -d -i "$1" "$2" | tar -xf - -C "$3"', '_', fichierCle, archive, cible],
      { env: envEnfant({ PATH: PATH_ENFANT }) },
    );
    expect(resultat.status, resultat.stderr.toString()).toBe(0);
    return cible;
  }

  async function verifierEnTeteAge(archive: string): Promise<void> {
    const descripteur = await open(archive, 'r');
    const entete = Buffer.alloc(21);
    await descripteur.read(entete, 0, 21, 0);
    await descripteur.close();
    expect(entete.toString('latin1')).toBe('age-encryption.org/v1');
    const brut = (await readFile(archive)).toString('latin1');
    expect(brut).not.toContain('PGDMP');
    expect(brut).not.toContain('%PDF');
  }

  beforeAll(async () => {
    connections = await recreateAzzelTestDb(ownerUrl, appUrl);
    owner = connections.owner;
    racine = await mkdtemp(path.join(tmpdir(), 'azzel-sauvegarde-script-'));
    stockage = path.join(racine, 'stockage');

    // Paire age jetable : la clé privée ne sert qu'à relire les archives du test.
    fichierCle = path.join(racine, 'cle.txt');
    const keygen = spawnSync('age-keygen', ['-o', fichierCle], {
      env: envEnfant({ PATH: PATH_ENFANT }),
    });
    expect(keygen.status).toBe(0);
    destinataire = /age1[0-9a-z]+/.exec(await readFile(fichierCle, 'utf8'))![0];

    serveur = createServer((requete, reponse) => {
      battements.push(requete.url ?? '');
      reponse.end('ok');
    });
    await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
    urlBattement = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/hb`;

    // Une preuve active, fichier réel dans le STORAGE_DIR temporaire.
    const store = new LocalDiskProofStore(stockage);
    const organisations = await owner<{ id: string }[]>`
      SELECT id FROM organisation WHERE slug = 'ait-aissi'
    `;
    const organisationId = organisations[0]!.id;
    const editions = await owner<{ id: string }[]>`
      SELECT id FROM edition WHERE slug = '2027' AND organisation_id = ${organisationId}
    `;
    const epreuves = await owner<{ id: string }[]>`
      SELECT id FROM epreuve WHERE edition_id = ${editions[0]!.id} AND slug = 'longue'
    `;
    const accountId = randomUUID();
    const coureurId = randomUUID();
    await owner`
      INSERT INTO account (id, organisation_id, email, role)
      VALUES (${accountId}, ${organisationId}, ${`sauvegarde-script-${accountId}@test.azzel`}, 'coureur')
    `;
    await owner`
      INSERT INTO coureur (
        id, organisation_id, account_id, edition_id, epreuve_id,
        first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
        birth_date, tshirt_size, age, age_category, status
      )
      VALUES (
        ${coureurId}, ${organisationId}, ${accountId}, ${editions[0]!.id}, ${epreuves[0]!.id},
        'Prenom', 'Nom', '+213555010996', 'Contact', '0555010995',
        DATE '1990-05-12', 'M', 36, 'Senior', 'en validation'
      )
    `;
    const preuve = await store.put(new TextEncoder().encode('%PDF-1.4\nscript\n%%EOF\n'), 'pdf');
    clePreuve = preuve.storageKey;
    await owner`
      INSERT INTO preuve (organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status)
      VALUES (${organisationId}, ${coureurId}, ${preuve.storageKey}, ${preuve.mime},
              ${preuve.sizeBytes}, ${preuve.sha256}, 'active')
    `;
  }, 120_000);

  beforeEach(() => {
    battements.length = 0;
  });

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
    }
    if (serveur) {
      await new Promise<void>((resoudre) => serveur.close(() => resoudre()));
    }
    if (racine) {
      await chmod(path.join(racine, 'injoignable', 'quotidien'), 0o755).catch(() => undefined);
      await rm(racine, { recursive: true, force: true });
    }
  });

  describe('garde-fous : arrêt avant tout dump', () => {
    const casGardeFous: {
      nom: string;
      mode: string;
      surcharges: Record<string, string | undefined>;
      message: RegExp;
      saute?: boolean;
    }[] = [
      {
        nom: 'pooler en mode transaction (port 6543)',
        mode: 'manuel',
        surcharges: { DATABASE_OWNER_URL: 'postgres://u:p@pooler.exemple.invalid:6543/postgres' },
        message: /port 6543/,
      },
      {
        nom: 'clé privée age dans AGE_RECIPIENT',
        mode: 'manuel',
        surcharges: { AGE_RECIPIENT: 'AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ' },
        message: /AGE_RECIPIENT contient une clé PRIVÉE/,
      },
      {
        nom: 'variable obligatoire absente (AGE_RECIPIENT)',
        mode: 'manuel',
        surcharges: { AGE_RECIPIENT: undefined },
        message: /AGE_RECIPIENT absente/,
        // Le script complète par le .env du dépôt : cas sans objet s'il la définit.
        saute: envDepotDefinit('AGE_RECIPIENT'),
      },
      {
        nom: 'mode inconnu',
        mode: 'hebdo',
        surcharges: {},
        message: /mode « hebdo » inconnu/,
      },
    ];

    it.each(casGardeFous)(
      '$nom : sortie 1, cause nommée, /fail, aucune archive',
      async ({ mode, surcharges, message, saute }) => {
        if (saute) {
          console.warn('cas sauté : le .env du dépôt définit la variable testée');
          return;
        }
        const destination = path.join(racine, `garde-${randomUUID()}`);

        const execution = await lancer(mode, environnement(destination, surcharges));

        expect(execution.code, execution.sortie).toBe(1);
        expect(execution.sortie).toMatch(message);
        expect(battements).toEqual(['/hb/fail']);
        expect(await fichiersSous(destination)).toEqual([]);
      },
      30_000,
    );
  });

  it('sha256 divergent : sortie 1, clé nommée, /fail, rien déposé', async () => {
    const destination = path.join(racine, 'sha-divergent');
    const fichier = path.join(stockage, clePreuve);
    const sauvegarde = path.join(racine, 'preuve-intacte');
    await copyFile(fichier, sauvegarde);
    await appendFile(fichier, 'X');
    try {
      const execution = await lancer('manuel', environnement(destination));

      expect(execution.code, execution.sortie).toBe(1);
      expect(execution.sortie).toContain(`sha256 divergent pour la preuve active : ${clePreuve}`);
      expect(battements).toEqual(['/hb/fail']);
      expect(await fichiersSous(destination)).toEqual([]);
    } finally {
      await copyFile(sauvegarde, fichier);
    }
  }, 180_000);

  it('nominal : archive chiffrée, rétention 7, manuel intact, dump restaurable, preuves = manifeste', async () => {
    const destination = path.join(racine, 'nominal');
    const anciennes = await semerArchives(path.join(destination, 'quotidien'), 7);
    const manuelles = await semerArchives(path.join(destination, 'manuel'), 1);

    const execution = await lancer('quotidien', environnement(destination));

    expect(execution.code, execution.sortie).toBe(0);
    expect(battements).toEqual(['/hb']);
    const quotidiennes = await lister(path.join(destination, 'quotidien'));
    expect(quotidiennes).toHaveLength(7);
    expect(quotidiennes.slice(0, 6)).toEqual(anciennes.slice(1));
    const nouvelle = quotidiennes[6]!;
    expect(nouvelle).toMatch(MOTIF_ARCHIVE);
    expect(execution.sortie).toContain('rétention quotidien/ : 1 archive(s) supprimée(s)');
    expect(await lister(path.join(destination, 'manuel'))).toEqual(manuelles);
    expect(existsSync(path.join(destination, 'hebdo'))).toBe(false);

    const archive = path.join(destination, 'quotidien', nouvelle);
    await verifierEnTeteAge(archive);

    // Avec la clé : le dump passe pg_restore --list…
    const clair = await dechiffrer(archive);
    const dump = await readFile(path.join(clair, 'base.dump'));
    const liste = spawnSync('docker', ['run', '--rm', '-i', '--quiet', PG_IMAGE, 'pg_restore', '--list'], {
      input: dump,
      env: { ...process.env, PATH: PATH_ENFANT },
    });
    expect(liste.status, liste.stderr.toString()).toBe(0);
    expect(liste.stdout.toString()).toMatch(/TABLE DATA public preuve\b/);

    // … et chaque preuve correspond au manifeste, à l'octet près.
    const manifeste = JSON.parse(
      await readFile(path.join(clair, 'manifeste.json'), 'utf8'),
    ) as Manifeste;
    const preuves = (await readdir(path.join(clair, 'preuves'))).sort();
    expect(preuves).toEqual(manifeste.preuves.map((preuve) => preuve.cle).sort());
    expect(preuves).toContain(clePreuve);
    for (const preuve of manifeste.preuves) {
      const octets = await readFile(path.join(clair, 'preuves', preuve.cle));
      expect(sha256(octets)).toBe(preuve.sha256);
    }
  }, 180_000);

  it('dimanche : copie sous hebdo/, 4 hebdomadaires gardées', async () => {
    const destination = path.join(racine, 'dimanche');
    const hebdo = await semerArchives(path.join(destination, 'hebdo'), 5);

    const execution = await lancer(
      'quotidien',
      environnement(destination, { SAUVEGARDE_JOUR_ISO: '7' }),
    );

    expect(execution.code, execution.sortie).toBe(0);
    expect(battements).toEqual(['/hb']);
    const [nouvelle] = await lister(path.join(destination, 'quotidien'));
    expect(nouvelle).toMatch(MOTIF_ARCHIVE);
    expect(await lister(path.join(destination, 'hebdo'))).toEqual([...hebdo.slice(2), nouvelle]);
  }, 180_000);

  it('course : base seule, 24 archives gardées', async () => {
    const destination = path.join(racine, 'course');
    const anciennes = await semerArchives(path.join(destination, 'course'), 26);

    const execution = await lancer('course', environnement(destination));

    expect(execution.code, execution.sortie).toBe(0);
    expect(battements).toEqual(['/hb']);
    const restantes = await lister(path.join(destination, 'course'));
    expect(restantes).toHaveLength(24);
    expect(restantes.slice(0, 23)).toEqual(anciennes.slice(3));
    const nouvelle = restantes[23]!;
    expect(nouvelle).toMatch(MOTIF_ARCHIVE);

    const clair = await dechiffrer(path.join(destination, 'course', nouvelle));
    expect((await readdir(clair)).sort()).toEqual(['base.dump']);
  }, 180_000);

  it('rclone (remote « :local: ») : envoi et rétention 7 par la branche de production', async () => {
    const dossier = path.join(racine, 'remote');
    const anciennes = await semerArchives(path.join(dossier, 'quotidien'), 7);
    const manuelles = await semerArchives(path.join(dossier, 'manuel'), 1);

    const execution = await lancer('quotidien', environnement(`:local:${dossier}`));

    expect(execution.code, execution.sortie).toBe(0);
    expect(battements).toEqual(['/hb']);
    const quotidiennes = await lister(path.join(dossier, 'quotidien'));
    expect(quotidiennes).toHaveLength(7);
    expect(quotidiennes.slice(0, 6)).toEqual(anciennes.slice(1));
    expect(quotidiennes[6]).toMatch(MOTIF_ARCHIVE);
    expect(await lister(path.join(dossier, 'manuel'))).toEqual(manuelles);
    await verifierEnTeteAge(path.join(dossier, 'quotidien', quotidiennes[6]!));
  }, 180_000);

  it.skipIf(process.getuid?.() === 0)(
    'destination injoignable : sortie 1, /fail appelé, aucune archive supprimée',
    async () => {
      const destination = path.join(racine, 'injoignable');
      const dossier = path.join(destination, 'quotidien');
      const anciennes = await semerArchives(dossier, 8);
      await chmod(dossier, 0o555);

      const execution = await lancer('quotidien', environnement(destination));

      await chmod(dossier, 0o755);
      expect(execution.code, execution.sortie).toBe(1);
      expect(execution.sortie).toContain('aucune purge de rétention');
      expect(battements).toEqual(['/hb/fail']);
      expect(await lister(dossier)).toEqual(anciennes);
    },
    180_000,
  );
});
