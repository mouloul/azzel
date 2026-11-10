// Story 11.1 — orchestration du pipeline GPX → parcours.json.
//
// Build-time UNIQUEMENT (jamais appelé au runtime ni par `pnpm build`) :
// exécuté à la main via `pnpm -F @azzel/web parcours:build`. Le FS est
// INJECTABLE pour rendre le versionnage testable sans toucher au dépôt.
//
// TRACE GELÉE (décision d’épopée) : parcours.json est une publication. Un
// contenu qui change SANS incrément de version est refusé en nommant la
// première différence ; `--nouvelle-version` réécrit en version N+1. Un
// contenu identique (hors champ version) est un no-op explicite.
//
// Porte FR-28b : le refus d’un relevé porte un code de sortie non nul et
// NOMME chaque défaut mesuré — jamais d’échec muet.

import { parserGpx } from './gpx';
import {
  ConfigInvalideError,
  construireParcoursDoc,
  validerConfig,
  type ParcoursConfig,
  type ParcoursDoc,
  type ReleveTraite,
} from './construire';
import { evaluerQualiteReleve, preparerGeometrie } from './traitement';

/** Relevé refusé par la porte de qualité — le message nomme chaque défaut et son chiffre. */
export class ReleveRefuseError extends Error {
  constructor(defauts: readonly string[], fichier?: string) {
    super(
      `relevé${fichier !== undefined ? ` ${fichier}` : ''} refusé par la porte de qualité :\n  - ${defauts.join('\n  - ')}`,
    );
    this.name = 'ReleveRefuseError';
  }
}

/** La trace gelée changerait sans incrément de version — le message nomme la première différence. */
export class TraceGeleeError extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = 'TraceGeleeError';
  }
}

/** FS minimal injecté (le vrai vient de node:fs/promises dans le CLI). */
export interface FsPipeline {
  lireFichier(chemin: string): Promise<string>;
  fichierExiste(chemin: string): Promise<boolean>;
  ecrireFichier(chemin: string, contenu: string): Promise<void>;
}

export interface EntreePipeline {
  fs: FsPipeline;
  /** Contenu brut du GPX source (déjà lu par l’appelant). */
  xmlGpx: string;
  /** GPX bruts des épreuves déclarant leur propre relevé, par slug. */
  xmlGpxEpreuves?: Readonly<Record<string, string>>;
  /** Contenu de parcours.config.json (déjà lu, validé ici). */
  config: unknown;
  /** Contenu actuel de parcours.json, ou null s’il n’existe pas. */
  existant: string | null;
  /** Chemin (résolu par l’appelant) où écrire parcours.json. */
  cheminSortie: string;
  /** Incrément de version explicite (–nouvelle-version). */
  nouvelleVersion: boolean;
}

export interface ResultatPipeline {
  statut: 'ecrit' | 'inchange';
  version: number;
  doc: ParcoursDoc;
}

/* ------------------------------------------------------------------ */
/* Sérialiseur déterministe lisible                                    */
/* ------------------------------------------------------------------ */

function estTableauPrimitif(v: readonly unknown[]): boolean {
  return v.every((e) => e === null || typeof e !== 'object');
}

function estPair(v: unknown, a: unknown): boolean {
  return JSON.stringify(v) === JSON.stringify(a);
}

/**
 * JSON lisible ET stable : objets et tableaux structurés sur plusieurs
 * lignes, tableaux de primitifs en ligne (coords/profile = une paire par
 * ligne — diff git exploitable sur la trace gelée, fichier compact).
 * JSON.stringify pur mettrait tout sur une ligne (diff illisible) ou
 * éclaterait chaque nombre sur sa ligne (fichier énorme).
 */
export function serialiserJson(valeur: unknown): string {
  const lignes: string[] = [];
  const ecris = (v: unknown, retrait: string): void => {
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lignes.push('[]');
        return;
      }
      if (estTableauPrimitif(v)) {
        lignes.push(`[${v.map((e) => JSON.stringify(e)).join(',')}]`);
        return;
      }
      lignes.push('[');
      const interne = `${retrait}  `;
      v.forEach((e, i) => {
        const derniere = i === v.length - 1;
        const premiere = lignes.length;
        ecris(e, interne);
        lignes[premiere] = `${interne}${lignes[premiere]}`;
        if (!derniere) {
          lignes[lignes.length - 1] += ',';
        }
      });
      lignes.push(`${retrait}]`);
      return;
    }
    if (typeof v === 'object' && v !== null) {
      const entrees = Object.entries(v as Record<string, unknown>);
      if (entrees.length === 0) {
        lignes.push('{}');
        return;
      }
      lignes.push('{');
      const interne = `${retrait}  `;
      entrees.forEach(([cle, e], i) => {
        const derniere = i === entrees.length - 1;
        const premiere = lignes.length;
        ecris(e, interne);
        lignes[premiere] = `${interne}${JSON.stringify(cle)}: ${lignes[premiere]}`;
        if (!derniere) {
          lignes[lignes.length - 1] += ',';
        }
      });
      lignes.push(`${retrait}}`);
      return;
    }
    lignes.push(JSON.stringify(v));
  };
  ecris(valeur, '');
  return `${lignes.join('\n')}\n`;
}

/* ------------------------------------------------------------------ */
/* Comparaison versionnée (première différence nommée)                  */
/* ------------------------------------------------------------------ */

function formaterValeur(v: unknown): string {
  if (typeof v === 'number') {
    return v.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
  }
  return JSON.stringify(v) ?? String(v);
}

/**
 * Compare deux documents en ignorant SEULEMENT la racine `version`.
 * Retourne le chemin de la première différence (ex. « coords[123][2] »)
 * avec les deux valeurs, ou null si identiques.
 */
export function premiereDifference(
  existant: unknown,
  nouveau: unknown,
  chemin = '',
): string | null {
  if (Array.isArray(existant) && Array.isArray(nouveau)) {
    if (existant.length !== nouveau.length) {
      return `${chemin || 'racine'} : longueurs différentes (${existant.length} ≠ ${nouveau.length})`;
    }
    for (let i = 0; i < existant.length; i++) {
      const diff = premiereDifference(existant[i], nouveau[i], `${chemin}[${i}]`);
      if (diff !== null) {
        return diff;
      }
    }
    return null;
  }
  if (
    typeof existant === 'object' && existant !== null && !Array.isArray(existant) &&
    typeof nouveau === 'object' && nouveau !== null && !Array.isArray(nouveau)
  ) {
    const clesExistant = Object.keys(existant as Record<string, unknown>);
    const clesNouveau = Object.keys(nouveau as Record<string, unknown>);
    for (const cle of [...clesExistant, ...clesNouveau.filter((k) => !clesExistant.includes(k))]) {
      if (chemin === '' && cle === 'version') {
        continue; // la version est JUSTEMENT le champ qu’on incrémenterait
      }
      const a = (existant as Record<string, unknown>)[cle];
      const b = (nouveau as Record<string, unknown>)[cle];
      if (a === undefined && b === undefined) {
        continue;
      }
      if (a === undefined || b === undefined) {
        return `${chemin ? `${chemin}.` : ''}${cle} : ${a === undefined ? 'absent du fichier existant' : 'absent du nouveau contenu'}`;
      }
      const diff = premiereDifference(a, b, `${chemin ? `${chemin}.` : ''}${cle}`);
      if (diff !== null) {
        return diff;
      }
    }
    return null;
  }
  if (!estPair(existant, nouveau)) {
    return `${chemin || 'racine'} : ${formaterValeur(existant)} ≠ ${formaterValeur(nouveau)}`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Exécution                                                            */
/* ------------------------------------------------------------------ */

/**
 * Exécute le pipeline complet. Erreurs nommées (le CLI les traduit en code
 * de sortie non nul) :
 * - ConfigInvalideError : config structurellement invalide ou bornes impossibles ;
 * - ReleveRefuseError : porte de qualité (aucun fichier écrit) ;
 * - TraceGeleeError : contenu changé sans `nouvelleVersion: true`.
 */
export async function executerPipeline(entree: EntreePipeline): Promise<ResultatPipeline> {
  const config: ParcoursConfig = validerConfig(entree.config);

  const releve = parserGpx(entree.xmlGpx);

  // Porte sur les points BRUTS, avant tout traitement (FR-28b).
  const rapport = evaluerQualiteReleve(releve.points);
  if (!rapport.accepte) {
    throw new ReleveRefuseError(rapport.defauts);
  }

  const geometrie = preparerGeometrie(releve.points);

  // Relevés propres des épreuves : même porte, même chaîne, refus nommé
  // avec le fichier fautif.
  const relevesEpreuves: Record<string, ReleveTraite> = {};
  for (const epreuve of config.epreuves) {
    if (epreuve.source === undefined) {
      continue;
    }
    const xml =
      entree.xmlGpxEpreuves !== undefined && Object.hasOwn(entree.xmlGpxEpreuves, epreuve.slug)
        ? entree.xmlGpxEpreuves[epreuve.slug]
        : undefined;
    if (xml === undefined) {
      throw new ConfigInvalideError(
        `épreuve « ${epreuve.slug} » : contenu du relevé ${epreuve.source.gpx} non fourni`,
      );
    }
    const releveEpreuve = parserGpx(xml);
    const rapportEpreuve = evaluerQualiteReleve(releveEpreuve.points);
    if (!rapportEpreuve.accepte) {
      throw new ReleveRefuseError(rapportEpreuve.defauts, epreuve.source.gpx.split('/').pop());
    }
    relevesEpreuves[epreuve.slug] = {
      releve: releveEpreuve,
      geometrie: preparerGeometrie(releveEpreuve.points),
      rapportQualite: rapportEpreuve,
    };
  }

  // Version : existant illisible ⇒ refus (trace gelée corrompue, jamais
  // réécrite en silence) ; contenu identique hors version ⇒ no-op.
  let versionExistante: number | null = null;
  let existantParse: unknown = null;
  if (entree.existant !== null) {
    try {
      existantParse = JSON.parse(entree.existant);
      const v = (existantParse as Record<string, unknown>).version;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
        throw new Error('version');
      }
      versionExistante = v;
    } catch {
      throw new TraceGeleeError(
        'parcours.json existant illisible ou sans version entière — corrigez-le avant de relancer le pipeline',
      );
    }
  }

  const prochaineVersion =
    entree.nouvelleVersion && versionExistante !== null ? versionExistante + 1 : 1;

  const doc = construireParcoursDoc({
    config,
    releve,
    geometrie,
    rapportQualite: rapport,
    relevesEpreuves,
    version: prochaineVersion,
  });

  if (existantParse !== null) {
    const difference = premiereDifference(existantParse, doc);
    if (difference === null) {
      return { statut: 'inchange', version: versionExistante as number, doc };
    }
    if (!entree.nouvelleVersion) {
      throw new TraceGeleeError(
        `le contenu de parcours.json changerait sans incrément de version — première différence : ${difference}. ` +
          'Relancez avec --nouvelle-version si ce changement est voulu (publication explicite).',
      );
    }
  }

  await entree.fs.ecrireFichier(entree.cheminSortie, serialiserJson(doc));
  return { statut: 'ecrit', version: doc.version, doc };
}
