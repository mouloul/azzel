// Story 11.1 — lecture de parcours.json côté serveur.
//
// Import STATIQUE du JSON commité : bundlé une fois côté serveur, JAMAIS
// dans un composant client ni dans le HTML de l’accueil (la section parcours
// est un composant serveur ; seules les métriques fusionnées partent dans le
// rendu). La validation est LÉGÈRE et DEFENSIVE : un parcours.json malformé
// (édition manuelle ratée) dégrade en `null` — la section 9.3 affiche sa
// coquille sans chiffres, elle ne casse pas.

import parcoursJson from './parcours.json';
import type { ParcoursDoc } from './construire';

function estNombre(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validation légère structurelle : assez pour croire les champs lus par la
 * fusion 9.3 (mesures, épreuves, points de passage), sans revalider toute la
 * géométrie — le pipeline reste le garant du contenu à l’écriture.
 */
export function validerParcoursDoc(valeur: unknown): ParcoursDoc | null {
  if (typeof valeur !== 'object' || valeur === null) {
    return null;
  }
  const doc = valeur as Record<string, unknown>;
  if (!estNombre(doc.version) || doc.version < 1) {
    return null;
  }
  if (!Array.isArray(doc.coords) || doc.coords.length < 2) {
    return null;
  }
  if (!Array.isArray(doc.profile) || !Array.isArray(doc.pointsDePassage)) {
    return null;
  }
  const mesures = doc.mesures;
  if (typeof mesures !== 'object' || mesures === null) {
    return null;
  }
  const epreuves = doc.epreuves;
  if (typeof epreuves !== 'object' || epreuves === null || Array.isArray(epreuves)) {
    return null;
  }
  return valeur as ParcoursDoc;
}

/** Le document publié, ou `null` s’il est malformé (dégradation 9.3). */
export const PARCOURS_DOC: ParcoursDoc | null = validerParcoursDoc(parcoursJson);

/** Accès de commodité — même valeur que PARCOURS_DOC (import figé au build). */
export function getParcoursDoc(): ParcoursDoc | null {
  return PARCOURS_DOC;
}
