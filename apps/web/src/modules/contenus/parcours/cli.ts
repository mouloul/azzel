// Story 11.1 — CLI du pipeline parcours (logique testable, sans process).
//
// Le shim exécutable vit dans apps/web/scripts/build-parcours.ts ; toute la
// décision (codes de sortie inclus) est ICI, injectable en FS, pour être
// testée sans sous-processus ni écriture réelle.
//
// Codes de sortie :
//   0  succès (parcours.json écrit, ou « aucun changement ») ;
//   1  relevé refusé par la porte de qualité (défauts nommés, rien écrit) ;
//   2  trace gelée : contenu changé sans --nouvelle-version ;
//   3  entrée illisible : arguments, config, GPX introuvable/invalide.

import path from 'node:path';

import {
  ConfigInvalideError,
  validerConfig,
  type ParcoursConfig,
} from './construire';
import { GpxInvalideError } from './gpx';
import {
  ReleveRefuseError,
  TraceGeleeError,
  executerPipeline,
  type FsPipeline,
} from './pipeline';

export const CODES_SORTIE = {
  ok: 0,
  porteRefusee: 1,
  traceGelee: 2,
  entreeInvalide: 3,
} as const;

export interface ResultatCli {
  code: number;
  lignes: readonly string[];
}

export interface OptionsCli {
  args: readonly string[];
  /** Racine du paquet web (…/apps/web) — config et sortie y vivent. */
  racineWeb: string;
  /** Racine du monorepo — le chemin GPX de la config y est résolu. */
  racineRepo: string;
  fs: FsPipeline;
}

const CHEMIN_CONFIG = path.join('src', 'modules', 'contenus', 'parcours', 'parcours.config.json');
const CHEMIN_SORTIE = path.join('src', 'modules', 'contenus', 'parcours', 'parcours.json');

/** Exécute le CLI et retourne le code de sortie + les lignes à afficher. */
export async function executerCli(opts: OptionsCli): Promise<ResultatCli> {
  const lignes: string[] = [];
  const inconnus = opts.args.filter((a) => a !== '--nouvelle-version');
  if (inconnus.length > 0) {
    return {
      code: CODES_SORTIE.entreeInvalide,
      lignes: [`argument inconnu : ${inconnus.join(', ')} (seul --nouvelle-version est accepté)`],
    };
  }
  const nouvelleVersion = opts.args.includes('--nouvelle-version');

  const cheminConfig = path.join(opts.racineWeb, CHEMIN_CONFIG);
  const cheminSortie = path.join(opts.racineWeb, CHEMIN_SORTIE);

  let configBrute: unknown;
  try {
    configBrute = JSON.parse(await opts.fs.lireFichier(cheminConfig));
  } catch (error) {
    return {
      code: CODES_SORTIE.entreeInvalide,
      lignes: [`config illisible (${cheminConfig}) : ${message(error)}`],
    };
  }

  let config: ParcoursConfig;
  try {
    config = validerConfig(configBrute);
  } catch (error) {
    if (!(error instanceof ConfigInvalideError)) {
      throw error;
    }
    return { code: CODES_SORTIE.entreeInvalide, lignes: [error.message] };
  }

  const cheminGpx = path.join(opts.racineRepo, config.source.gpx);
  let xmlGpx: string;
  try {
    xmlGpx = await opts.fs.lireFichier(cheminGpx);
  } catch (error) {
    return {
      code: CODES_SORTIE.entreeInvalide,
      lignes: [`GPX introuvable ou illisible (${cheminGpx}) : ${message(error)}`],
    };
  }

  const xmlGpxEpreuves: Record<string, string> = {};
  for (const epreuve of config.epreuves) {
    if (epreuve.source === undefined) {
      continue;
    }
    const chemin = path.join(opts.racineRepo, epreuve.source.gpx);
    try {
      xmlGpxEpreuves[epreuve.slug] = await opts.fs.lireFichier(chemin);
    } catch (error) {
      return {
        code: CODES_SORTIE.entreeInvalide,
        lignes: [`GPX de l’épreuve « ${epreuve.slug} » introuvable ou illisible (${chemin}) : ${message(error)}`],
      };
    }
  }

  let existant: string | null = null;
  if (await opts.fs.fichierExiste(cheminSortie)) {
    try {
      existant = await opts.fs.lireFichier(cheminSortie);
    } catch (error) {
      return {
        code: CODES_SORTIE.entreeInvalide,
        lignes: [`parcours.json existant illisible (${cheminSortie}) : ${message(error)}`],
      };
    }
  }

  try {
    const resultat = await executerPipeline({
      fs: opts.fs,
      xmlGpx,
      xmlGpxEpreuves,
      config: configBrute,
      existant,
      cheminSortie,
      nouvelleVersion,
    });
    const { mesures, source } = resultat.doc;
    if (resultat.statut === 'inchange') {
      lignes.push(
        `parcours.json inchangé (version ${resultat.version}) — aucun changement, rien n’a été réécrit.`,
      );
    } else {
      lignes.push(`parcours.json écrit — version ${resultat.version} (publication explicite).`);
    }
    lignes.push(
      `relevé ${source.fichier} : ${source.pointsBruts.toLocaleString('fr-FR')} points bruts → ${source.pointsGardes.toLocaleString('fr-FR')} gardés (fusion ${resultat.doc.constantes.seuilFusionM} m).`,
    );
    lignes.push(
      `distance ${(mesures.distanceM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km — D+ brut ${mesures.dplusBrutM} m → ${mesures.dplusM} m au seuil ${resultat.doc.constantes.seuilDplusM} m (chiffre publié).`,
    );
    for (const [slug, vue] of Object.entries(resultat.doc.epreuves)) {
      if (vue.source === undefined) {
        continue;
      }
      lignes.push(
        `épreuve ${slug} : relevé ${vue.source.fichier} — ${vue.source.pointsBruts.toLocaleString('fr-FR')} points bruts → ${vue.source.pointsGardes.toLocaleString('fr-FR')} gardés, distance ${(vue.distanceM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km, D+ ${vue.dplusM} m.`,
      );
    }
    return { code: CODES_SORTIE.ok, lignes };
  } catch (error) {
    if (error instanceof ReleveRefuseError) {
      return { code: CODES_SORTIE.porteRefusee, lignes: [error.message] };
    }
    if (error instanceof TraceGeleeError) {
      return { code: CODES_SORTIE.traceGelee, lignes: [error.message] };
    }
    if (error instanceof GpxInvalideError || error instanceof ConfigInvalideError) {
      return { code: CODES_SORTIE.entreeInvalide, lignes: [error.message] };
    }
    throw error;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
