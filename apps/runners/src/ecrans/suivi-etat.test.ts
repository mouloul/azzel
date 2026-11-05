import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

/* Story 10.2 — écran Suivi : l'état du suivi (activé / désactivé / en
 * pause / interrompu) lisible EN TÊTE d'écran, avant le titre ; hiérarchie
 * état → journal de synchro. Aucune donnée de progression ni de position
 * n'existe dans EtatSuiviApp (orchestration-suivi.ts) : l'écran n'en
 * invente aucune. Garanties 6.2/6.3/6.4 et « Désactivé : rien n'est
 * enregistré » intactes. */

vi.mock('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(true) },
  Pressable: {},
  ScrollView: {},
  Switch: {},
  Text: {},
  View: {},
}));

import { libelleEtatSuivi } from './suivi';
import type { EtatSuivi } from '../tracking/moteur';

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'suivi.tsx'),
  'utf8',
);
const SOURCE_MOTEUR = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../tracking/moteur.ts'),
  'utf8',
);

describe('libelleEtatSuivi — les états vécus, en toutes lettres', () => {
  it('désactivé', () => {
    expect(libelleEtatSuivi(false, 'inactif')).toBe('Suivi désactivé');
  });

  it('activé', () => {
    expect(libelleEtatSuivi(true, 'actif')).toBe('Suivi activé');
  });

  it('activé, avant-plan seul — honnête sur ce qui est capturé', () => {
    expect(libelleEtatSuivi(true, 'actif-avant-plan')).toBe('Suivi activé (app ouverte)');
  });

  it('en pause (permission refusée — repart toute seule une fois autorisée)', () => {
    expect(libelleEtatSuivi(true, 'permission-refusee')).toBe('Suivi en pause');
  });

  it('interrompu (piège « Autoriser une fois »)', () => {
    expect(libelleEtatSuivi(true, 'interrompu')).toBe('Suivi interrompu');
  });

  // B1 (revue épopée 10) — atteignable via demarrerSansEchec → 'inactif'
  // (services de localisation coupés, erreur capteur), au démarrage comme
  // au toggle : cet état n'affirme JAMAIS un suivi actif.
  it('demandé mais PAS démarré — jamais « Suivi activé »', () => {
    expect(libelleEtatSuivi(true, 'inactif')).toBe('Suivi demandé, pas démarré');
  });

  it('exhaustif : chaque valeur de EtatSuivi a un libellé distinct (aucun default qui absorbe)', () => {
    // Les valeurs sont lues dans la définition du type (moteur.ts) : un
    // nouvel état du moteur fait échouer ce test jusqu'à ce qu'il ait son
    // libellé — le switch de suivi.tsx n'a pas de default.
    const bloc = SOURCE_MOTEUR.slice(
      SOURCE_MOTEUR.indexOf('export type EtatSuivi'),
      SOURCE_MOTEUR.indexOf('export type PermissionsSuivi'),
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const etats = [...bloc.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(etats.length).toBeGreaterThanOrEqual(5);
    const libelles = etats.map((etat) => libelleEtatSuivi(true, etat as EtatSuivi));
    expect(new Set(libelles).size, `libellés en doublon : ${libelles.join(' / ')}`).toBe(
      etats.length,
    );
    const blocSwitch = SOURCE.slice(
      SOURCE.indexOf('switch (etatMoteur)'),
      SOURCE.indexOf('export interface PropsEcranSuivi'),
    );
    expect(blocSwitch).not.toContain('default:');
    expect(blocSwitch).toContain("case 'inactif':");
  });
});

describe('écran Suivi — hiérarchie verrouillée par lecture de source (story 10.2)', () => {
  it("l'état est rendu AVANT le titre, sur une rangée à cible ≥ 48 dp", () => {
    const posEtat = SOURCE.indexOf('libelleEtatSuivi(optIn');
    const posTitre = SOURCE.indexOf('<Titre');
    expect(posEtat).toBeGreaterThan(-1);
    expect(posTitre).toBeGreaterThan(-1);
    expect(posEtat, "l'état doit précéder le titre dans l'écran").toBeLessThan(posTitre);
    expect(SOURCE).toMatch(/minHeight: 48 \}\}>\s*<Switch[\s\S]{0,800}libelleEtatSuivi\(optIn/);
  });

  it('le journal de synchro vient APRÈS l’état (l’état domine, le journal suit)', () => {
    const posEtat = SOURCE.indexOf('libelleEtatSuivi(optIn');
    const posBandeau = SOURCE.indexOf('<BandeauSync');
    expect(posBandeau).toBeGreaterThan(-1);
    expect(posEtat).toBeLessThan(posBandeau);
  });

  it('garantie 6.2 intacte : « Désactivé : rien n’est enregistré »', () => {
    expect(SOURCE).toContain('Désactivé : rien n’est enregistré.');
  });

  // B1 (revue épopée 10) — dans l'état (true, 'inactif'), le CORPS de
  // l'écran n'affirme aucun partage : la promesse « Ta position est
  // partagée toutes les 7 minutes » est réservée aux états réellement
  // actifs (branche de repli, APRÈS le test pasDemarre).
  it('(true, inactif) : le corps dit l’échec du démarrage, jamais un partage', () => {
    expect(SOURCE).toContain('pasDemarre ? (');
    expect(SOURCE).toContain('Le suivi n’a pas pu démarrer');
    const posPartage = SOURCE.indexOf('Ta position est partagée');
    const posPasDemarre = SOURCE.indexOf('pasDemarre ? (');
    expect(posPasDemarre).toBeGreaterThan(-1);
    expect(
      posPartage,
      'la promesse de partage doit venir APRÈS la branche pasDemarre (repli = actif)',
    ).toBeGreaterThan(posPasDemarre);
  });
});
