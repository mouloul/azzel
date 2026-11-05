import { describe, expect, it } from 'vitest';

import {
  COUREUR_STATUS_EN_CONSTITUTION,
  COUREUR_STATUS_LISTE_ATTENTE,
  STATUTS_OCCUPANT_UNE_PLACE,
  doitAfficherPlaces,
  placesRestantes,
  statutInitial,
} from './domain';

describe('placesRestantes', () => {
  it('capacité moins les places occupées', () => {
    expect(placesRestantes(600, 412)).toBe(188);
  });

  it('jamais négatif : une capacité abaissée sous le nombre d’inscrits donne zéro', () => {
    // L'organisation peut baisser la capacité après coup ; aucun écran ne doit
    // afficher « −14 places », et aucun calcul en aval ne doit voir un négatif.
    expect(placesRestantes(400, 414)).toBe(0);
  });

  it('capacité nulle : complet d’emblée', () => {
    expect(placesRestantes(0, 0)).toBe(0);
  });
});

describe('doitAfficherPlaces — le compteur se montre sous le seuil', () => {
  it('au-dessus du seuil : muet', () => {
    expect(doitAfficherPlaces(500, 200)).toBe(false);
  });

  it('pile au seuil : visible', () => {
    expect(doitAfficherPlaces(200, 200)).toBe(true);
  });

  it('sous le seuil : visible', () => {
    expect(doitAfficherPlaces(12, 200)).toBe(true);
  });

  it('complet : visible — « 0 place » est une information, pas un silence', () => {
    expect(doitAfficherPlaces(0, 200)).toBe(true);
  });

  it('seuil à zéro : le compteur ne sort qu’une fois complet', () => {
    expect(doitAfficherPlaces(1, 0)).toBe(false);
    expect(doitAfficherPlaces(0, 0)).toBe(true);
  });
});

describe('statutInitial — qui prend une place, qui attend', () => {
  it('place disponible : en constitution', () => {
    expect(statutInitial(1)).toBe(COUREUR_STATUS_EN_CONSTITUTION);
  });

  it('plus de place : liste d’attente', () => {
    expect(statutInitial(0)).toBe(COUREUR_STATUS_LISTE_ATTENTE);
  });
});

describe('STATUTS_OCCUPANT_UNE_PLACE', () => {
  it('un dossier en constitution occupe sa place : elle lui est réservée le temps de payer', () => {
    expect(STATUTS_OCCUPANT_UNE_PLACE).toContain(COUREUR_STATUS_EN_CONSTITUTION);
  });

  it('un dossier validé occupe sa place', () => {
    expect(STATUTS_OCCUPANT_UNE_PLACE).toContain('validé');
  });

  it('un refusé et un en attente n’occupent rien — sinon la place serait perdue', () => {
    expect(STATUTS_OCCUPANT_UNE_PLACE).not.toContain('refusé');
    expect(STATUTS_OCCUPANT_UNE_PLACE).not.toContain(COUREUR_STATUS_LISTE_ATTENTE);
  });
});
