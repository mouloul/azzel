import { describe, expect, it } from 'vitest';

import { statutAffiche } from './domain';

describe('statutAffiche — ce que le coureur et l’organisation lisent', () => {
  it('en constitution : en attente de justificatif de paiement (au coureur d’agir)', () => {
    expect(statutAffiche('en constitution').libelle).toBe(
      'En attente de justificatif de paiement',
    );
  });

  it('en validation : en attente de validation par l’organisation', () => {
    expect(statutAffiche('en validation').libelle).toBe(
      'En attente de validation par l’organisation',
    );
  });

  it('les deux attentes ne se confondent jamais, même pastille comprise', () => {
    // La pastille distingue « à toi d'agir » de « on attend l'organisation » :
    // sans cela, les deux libellés partageraient le même signal visuel.
    expect(statutAffiche('en constitution').pastille).not.toBe(
      statutAffiche('en validation').pastille,
    );
  });

  it('validé et refusé : libellés tels quels', () => {
    expect(statutAffiche('validé').libelle).toBe('Validé');
    expect(statutAffiche('refusé').libelle).toBe('Refusé');
  });

  it('liste d’attente et expirée : jamais « en attente de justificatif »', () => {
    // Un coureur en liste d'attente n'a aucun versement à faire : lui annoncer
    // qu'on attend son justificatif serait lui réclamer un paiement.
    expect(statutAffiche('liste d’attente').libelle).toBe('Liste d’attente');
    expect(statutAffiche('expirée').libelle).toBe('Expirée');
  });

  it('statut inconnu : rendu tel quel plutôt qu’un blanc', () => {
    expect(statutAffiche('statut-futur').libelle).toBe('statut-futur');
  });
});
