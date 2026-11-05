import { describe, expect, it } from 'vitest';

import { CHAMPS_REGLAGES, LIBELLES_REGLAGES } from './domain';
import { normaliserReglages } from './service';

describe('réglage « afficher la date exacte de la course »', () => {
  it('fait partie des réglages pilotables, avec son libellé', () => {
    expect(CHAMPS_REGLAGES).toContain('dateCoursePublique');
    expect(LIBELLES_REGLAGES.dateCoursePublique).toMatch(/date/i);
  });

  it('accepte 0 (cachée) et 1 (publiée)', () => {
    expect(normaliserReglages({ dateCoursePublique: 0 }).reglages.dateCoursePublique).toBe(0);
    expect(normaliserReglages({ dateCoursePublique: '1' }).reglages.dateCoursePublique).toBe(1);
  });

  it('refuse toute autre valeur : ce n’est pas un nombre, c’est un choix oui / non', () => {
    // Un 2 ou un 600 « passerait » comme entier positif ordinaire et serait
    // écrit tel quel : la contrainte SQL le refuserait, en 500.
    for (const valeur of [2, 600, -1]) {
      const { reglages, erreurs } = normaliserReglages({ dateCoursePublique: valeur });
      expect(erreurs.dateCoursePublique, String(valeur)).toBeDefined();
      expect(reglages.dateCoursePublique, String(valeur)).toBeUndefined();
    }
  });

  it('absent de l’envoi : ni écrit ni journalisé', () => {
    const { reglages, erreurs } = normaliserReglages({ capacite: 700 });
    expect(reglages.dateCoursePublique).toBeUndefined();
    expect(erreurs.dateCoursePublique).toBeUndefined();
  });
});
