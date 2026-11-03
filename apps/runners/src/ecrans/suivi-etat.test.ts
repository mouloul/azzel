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

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'suivi.tsx'),
  'utf8',
);

describe('libelleEtatSuivi — les quatre états vécus, en toutes lettres', () => {
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

  it('le journal de synchro vient APRÈS l’état (état → journal, rien entre les deux)', () => {
    const posEtat = SOURCE.indexOf('libelleEtatSuivi(optIn');
    const posBandeau = SOURCE.indexOf('<BandeauSync');
    expect(posBandeau).toBeGreaterThan(-1);
    expect(posEtat).toBeLessThan(posBandeau);
  });

  it('garantie 6.2 intacte : « Désactivé : rien n’est enregistré »', () => {
    expect(SOURCE).toContain('Désactivé : rien n’est enregistré.');
  });
});
