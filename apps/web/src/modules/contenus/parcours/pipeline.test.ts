import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { CODES_SORTIE, executerCli } from './cli';
import { parserGpx } from './gpx';
import {
  ReleveRefuseError,
  TraceGeleeError,
  executerPipeline,
  premiereDifference,
  serialiserJson,
  type FsPipeline,
} from './pipeline';

/* GPX de test qui PASSE la porte : 40 points, 1 s de pas, ~10 m/s (10 m/s
 * < 12,5 m/s), aucun segment long. Produit par le test, jamais livré. */
function gpxDeTest(nbPoints = 40): string {
  const points = Array.from({ length: nbPoints }, (_, i) => {
    const t = new Date(Date.parse('2026-01-01T08:00:00.000Z') + i * 1000).toISOString();
    // ~10 m par point à l’équateur (1° ≈ 111 194,93 m) ; altitude en dents
    // de scie de 6 m : quelques franchissements du seuil D+.
    const lon = (i * 10) / 111_194.93;
    const ele = 100 + 6 * Math.sin(i / 3);
    return `<trkpt lat="0" lon="${lon.toFixed(8)}"><ele>${ele.toFixed(2)}</ele><time>${t}</time></trkpt>`;
  });
  return `<?xml version="1.0"?><gpx><trk><name>Pipeline test</name><trkseg>${points.join('')}</trkseg></trk></gpx>`;
}

const CONFIG_TEST = {
  source: { gpx: 'fixtures/pipeline.test.gpx' },
  pointsDePassage: [],
  epreuves: [{ slug: 'longue', portions: [{ de: 'depart', a: 'arrivee' }] }],
};

/** FS en mémoire : compte les écritures (la porte ne doit JAMAIS écrire). */
function fsMemoire(fichiers: Record<string, string> = {}): FsPipeline & {
  ecrits: Map<string, string>;
} {
  const ecrits = new Map<string, string>();
  return {
    ecrits,
    lireFichier: async (chemin) => {
      const contenu = fichiers[chemin];
      if (contenu === undefined) {
        throw new Error(`fichier absent : ${chemin}`);
      }
      return contenu;
    },
    fichierExiste: async (chemin) => chemin in fichiers,
    ecrireFichier: async (chemin, contenu) => {
      ecrits.set(chemin, contenu);
    },
  };
}

const CHEMIN_SORTIE = '/sortie/parcours.json';

async function pipelineUneFois(
  fs: ReturnType<typeof fsMemoire>,
  existant: string | null,
  nouvelleVersion = false,
) {
  return executerPipeline({
    fs,
    xmlGpx: gpxDeTest(),
    config: CONFIG_TEST,
    existant,
    cheminSortie: CHEMIN_SORTIE,
    nouvelleVersion,
  });
}

describe('parcours — versionnage de la trace gelée', () => {
  it('premier appel : écrit parcours.json version 1, contenu sérialisé rejouable', async () => {
    const fs = fsMemoire();
    const resultat = await pipelineUneFois(fs, null);
    expect(resultat.statut).toBe('ecrit');
    expect(resultat.version).toBe(1);
    const contenu = fs.ecrits.get(CHEMIN_SORTIE);
    expect(contenu).toBeDefined();
    // JSON valide et déterministe : re-sérialiser le document parsed donne
    // exactement les mêmes octets (stabilité git de la trace gelée).
    const reparsé = JSON.parse(contenu as string);
    expect(serialiserJson(reparsé)).toBe(contenu);
  });

  it('re-construction identique : no-op « aucun changement », rien réécrit', async () => {
    const fs = fsMemoire();
    const premier = await pipelineUneFois(fs, null);
    const ecritAvant = fs.ecrits.size;
    const deuxieme = await pipelineUneFois(fs, premier === null ? null : fs.ecrits.get(CHEMIN_SORTIE) ?? null);
    expect(deuxieme.statut).toBe('inchange');
    expect(deuxieme.version).toBe(1);
    expect(fs.ecrits.size).toBe(ecritAvant); // aucun rewrite
  });

  it('contenu changé sans --nouvelle-version : échec NOMMANT la première différence', async () => {
    const fs = fsMemoire();
    await pipelineUneFois(fs, null);
    const existant = JSON.parse(fs.ecrits.get(CHEMIN_SORTIE) as string);
    // Simule un relevé différent : une altitude change au milieu de la trace.
    existant.coords[10][2] = (existant.coords[10][2] as number) + 3;
    await expect(
      pipelineUneFois(fs, JSON.stringify(existant)),
    ).rejects.toThrow(TraceGeleeError);
    await expect(pipelineUneFois(fs, JSON.stringify(existant))).rejects.toThrow(
      /coords\[10\]\[2\]/,
    );
  });

  it('contenu changé AVEC --nouvelle-version : réécrit en version N+1', async () => {
    const fs = fsMemoire();
    await pipelineUneFois(fs, null);
    const existant = JSON.parse(fs.ecrits.get(CHEMIN_SORTIE) as string);
    // Version 2 déjà publiée AVEC un contenu différent : l’incrément mène à 3.
    existant.version = 2;
    existant.coords[10][2] = (existant.coords[10][2] as number) + 3;
    const resultat = await pipelineUneFois(fs, JSON.stringify(existant), true);
    expect(resultat.statut).toBe('ecrit');
    expect(resultat.version).toBe(3);
    expect(JSON.parse(fs.ecrits.get(CHEMIN_SORTIE) as string).version).toBe(3);
  });

  it('la comparaison ignore UNIQUEMENT le champ racine version', () => {
    const doc = { version: 1, mesures: { distanceM: 100 }, liste: [1, 2] };
    expect(premiereDifference(doc, { ...doc, version: 7 })).toBeNull();
    expect(premiereDifference(doc, { ...doc, mesures: { distanceM: 101 } })).toContain(
      'mesures.distanceM',
    );
    expect(premiereDifference(doc, { ...doc, liste: [1, 2, 3] })).toContain('longueurs');
  });
});

describe('parcours — CLI (codes de sortie)', () => {
  const racineWeb = '/web';
  const racineRepo = '/repo';
  const cheminConfig = path.join(racineWeb, 'src/modules/contenus/parcours/parcours.config.json');
  const cheminGpx = path.join(racineRepo, CONFIG_TEST.source.gpx);

  function fsCli(fichiers: Record<string, string>): ReturnType<typeof fsMemoire> {
    return fsMemoire(fichiers);
  }

  it('succès : parcours.json écrit puis « inchangé » — exit 0 les deux fois', async () => {
    const fs = fsCli({ [cheminConfig]: JSON.stringify(CONFIG_TEST), [cheminGpx]: gpxDeTest() });
    const premier = await executerCli({ args: [], racineWeb, racineRepo, fs });
    expect(premier.code).toBe(CODES_SORTIE.ok);
    expect(premier.lignes.join('\n')).toContain('version 1');
    const second = await executerCli({
      args: [],
      racineWeb,
      racineRepo,
      fs: fsMemoire({
        [cheminConfig]: JSON.stringify(CONFIG_TEST),
        [cheminGpx]: gpxDeTest(),
        [path.join(racineWeb, 'src/modules/contenus/parcours/parcours.json')]:
          fs.ecrits.get(path.join(racineWeb, 'src/modules/contenus/parcours/parcours.json')) ?? '',
      }),
    });
    expect(second.code).toBe(CODES_SORTIE.ok);
    expect(second.lignes.join('\n')).toContain('inchangé');
  });

  it('relevé refusé par la porte : exit 1, défauts nommés, AUCUN fichier écrit', async () => {
    const mauvaisGpx = readFileSync(
      // parcours/ → contenus → modules → src → web → apps → racine (6 niveaux).
      fileURLToPath(new URL('../../../../../../docs/GPX/activity_24827718657.gpx', import.meta.url)),
      'utf8',
    );
    const fs = fsCli({ [cheminConfig]: JSON.stringify(CONFIG_TEST), [cheminGpx]: mauvaisGpx });
    const resultat = await executerCli({ args: [], racineWeb, racineRepo, fs });
    expect(resultat.code).toBe(CODES_SORTIE.porteRefusee);
    const journal = resultat.lignes.join('\n');
    expect(journal).toContain('pas médian 3 s');
    expect(journal).toContain('> 30 s');
    expect(journal).toContain('47 points à vitesse');
    expect(fs.ecrits.size).toBe(0); // refus ⇒ aucun fichier écrit
  });

  it('trace gelée sans --nouvelle-version : exit 2 ; avec le flag : exit 0 et version +1', async () => {
    const base = { [cheminConfig]: JSON.stringify(CONFIG_TEST), [cheminGpx]: gpxDeTest() };
    const cheminSortie = path.join(racineWeb, 'src/modules/contenus/parcours/parcours.json');
    const fsPremier = fsCli(base);
    await executerCli({ args: [], racineWeb, racineRepo, fs: fsPremier });
    const existant = JSON.parse(fsPremier.ecrits.get(cheminSortie) as string);
    existant.mesures.distanceM = 12345; // contenu changé

    const refuse = await executerCli({
      args: [],
      racineWeb,
      racineRepo,
      fs: fsCli({ ...base, [cheminSortie]: JSON.stringify(existant) }),
    });
    expect(refuse.code).toBe(CODES_SORTIE.traceGelee);
    expect(refuse.lignes.join('\n')).toContain('--nouvelle-version');

    const accepte = await executerCli({
      args: ['--nouvelle-version'],
      racineWeb,
      racineRepo,
      fs: fsCli({ ...base, [cheminSortie]: JSON.stringify(existant) }),
    });
    expect(accepte.code).toBe(CODES_SORTIE.ok);
    expect(accepte.lignes.join('\n')).toContain('version 2');
  });

  it('arguments inconnus, config absente, GPX absent : exit 3 (entrées invalides)', async () => {
    expect(
      (await executerCli({ args: ['--autre'], racineWeb, racineRepo, fs: fsCli({}) })).code,
    ).toBe(CODES_SORTIE.entreeInvalide);
    expect(
      (await executerCli({ args: [], racineWeb, racineRepo, fs: fsCli({}) })).code,
    ).toBe(CODES_SORTIE.entreeInvalide);
    expect(
      (
        await executerCli({
          args: [],
          racineWeb,
          racineRepo,
          fs: fsCli({ [cheminConfig]: JSON.stringify(CONFIG_TEST) }),
        })
      ).code,
    ).toBe(CODES_SORTIE.entreeInvalide);
  });
});

describe('parcours — refus direct par la porte (pipeline, pas CLI)', () => {
  it('ReleveRefuseError porte les défauts nommés', async () => {
    // 3 points espacés de 200 m en 1 s : 200 m/s ⇒ vitesse implausible.
    const xml = `<?xml version="1.0"?><gpx><trk><name>Vitesse</name><trkseg>
<trkpt lat="0" lon="0"><ele>100</ele><time>2026-01-01T08:00:00.000Z</time></trkpt>
<trkpt lat="0" lon="0.0018"><ele>100</ele><time>2026-01-01T08:00:01.000Z</time></trkpt>
<trkpt lat="0" lon="0.0036"><ele>100</ele><time>2026-01-01T08:00:02.000Z</time></trkpt>
</trkseg></trk></gpx>`;
    const releve = parserGpx(xml);
    const fs = fsMemoire();
    await expect(
      executerPipeline({
        fs,
        xmlGpx: xml,
        config: CONFIG_TEST,
        existant: null,
        cheminSortie: CHEMIN_SORTIE,
        nouvelleVersion: false,
      }),
    ).rejects.toThrow(ReleveRefuseError);
    expect(fs.ecrits.size).toBe(0);
    expect(releve.points).toHaveLength(3);
  });
});

describe('parcours — épreuve sur son propre relevé (pipeline et CLI)', () => {
  const CONFIG_ANNEXE = {
    ...CONFIG_TEST,
    epreuves: [
      ...CONFIG_TEST.epreuves,
      { slug: 'moyenne', source: { gpx: 'fixtures/annexe.test.gpx' } },
    ],
  };

  it('pipeline : le relevé de l’épreuve est parsé, préparé et appendu', async () => {
    const fs = fsMemoire();
    const resultat = await executerPipeline({
      fs,
      xmlGpx: gpxDeTest(),
      xmlGpxEpreuves: { moyenne: gpxDeTest(20) },
      config: CONFIG_ANNEXE,
      existant: null,
      cheminSortie: CHEMIN_SORTIE,
      nouvelleVersion: false,
    });
    const { doc } = resultat;
    expect(doc.epreuves.moyenne?.source?.fichier).toBe('annexe.test.gpx');
    expect(doc.epreuves.moyenne?.source?.pointsBruts).toBe(20);
    expect(doc.coords.length).toBe(
      doc.source.pointsGardes + (doc.epreuves.moyenne?.source?.pointsGardes ?? 0),
    );
  });

  it('pipeline : relevé d’épreuve refusé par la porte ⇒ défauts nommés AVEC le fichier, rien écrit', async () => {
    const xmlVitesse = `<?xml version="1.0"?><gpx><trk><name>Vitesse</name><trkseg>
<trkpt lat="0" lon="0"><ele>100</ele><time>2026-01-01T08:00:00.000Z</time></trkpt>
<trkpt lat="0" lon="0.0018"><ele>100</ele><time>2026-01-01T08:00:01.000Z</time></trkpt>
<trkpt lat="0" lon="0.0036"><ele>100</ele><time>2026-01-01T08:00:02.000Z</time></trkpt>
</trkseg></trk></gpx>`;
    const fs = fsMemoire();
    const appel = executerPipeline({
      fs,
      xmlGpx: gpxDeTest(),
      xmlGpxEpreuves: { moyenne: xmlVitesse },
      config: CONFIG_ANNEXE,
      existant: null,
      cheminSortie: CHEMIN_SORTIE,
      nouvelleVersion: false,
    });
    await expect(appel).rejects.toThrow(ReleveRefuseError);
    await expect(appel).rejects.toThrow(/annexe\.test\.gpx/);
    expect(fs.ecrits.size).toBe(0);
  });

  it('CLI : lit le GPX de l’épreuve, l’annonce ; absent ⇒ exit 3', async () => {
    const racineWeb = '/web';
    const racineRepo = '/repo';
    const cheminConfig = path.join(racineWeb, 'src/modules/contenus/parcours/parcours.config.json');
    const fichiers = {
      [cheminConfig]: JSON.stringify(CONFIG_ANNEXE),
      [path.join(racineRepo, CONFIG_TEST.source.gpx)]: gpxDeTest(),
    };
    const absent = await executerCli({ args: [], racineWeb, racineRepo, fs: fsMemoire(fichiers) });
    expect(absent.code).toBe(CODES_SORTIE.entreeInvalide);
    expect(absent.lignes.join('\n')).toContain('annexe.test.gpx');

    const ok = await executerCli({
      args: [],
      racineWeb,
      racineRepo,
      fs: fsMemoire({ ...fichiers, [path.join(racineRepo, 'fixtures/annexe.test.gpx')]: gpxDeTest(20) }),
    });
    expect(ok.code).toBe(CODES_SORTIE.ok);
    expect(ok.lignes.join('\n')).toMatch(/épreuve moyenne : relevé annexe\.test\.gpx/);
  });
});
