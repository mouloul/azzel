import { describe, expect, it } from 'vitest';

import { statutAffiche } from './domain';

describe('statutAffiche — ce que le coureur et l’organisation lisent', () => {
  it('place prise, aucune preuve : en attente de justificatif de paiement', () => {
    expect(statutAffiche('en constitution', false).libelle).toBe(
      'En attente de justificatif de paiement',
    );
  });

  it('preuve déposée : en attente de validation par l’organisation', () => {
    expect(statutAffiche('en constitution', true).libelle).toBe(
      'En attente de validation par l’organisation',
    );
  });

  it('les deux situations ne se confondent jamais, même pastille comprise', () => {
    // La pastille distingue « à toi d'agir » de « on attend l'organisation » :
    // sans cela, les deux libellés partageraient le même signal visuel.
    expect(statutAffiche('en constitution', false).pastille).not.toBe(
      statutAffiche('en constitution', true).pastille,
    );
  });

  it('validé : inchangé, la preuve n’y change rien', () => {
    expect(statutAffiche('validé', true).libelle).toBe('Validé');
    expect(statutAffiche('validé', false).libelle).toBe('Validé');
  });

  it('refusé : inchangé même avec une preuve déposée', () => {
    expect(statutAffiche('refusé', true).libelle).toBe('Refusé');
  });

  it('liste d’attente et expirée : jamais « en attente de justificatif »', () => {
    // Un coureur en liste d'attente n'a aucun versement à faire : lui annoncer
    // qu'on attend son justificatif serait lui réclamer un paiement.
    expect(statutAffiche('liste d’attente', false).libelle).toBe('Liste d’attente');
    expect(statutAffiche('expirée', false).libelle).toBe('Expirée');
  });

  it('statut inconnu : rendu tel quel plutôt qu’un blanc', () => {
    expect(statutAffiche('statut-futur', false).libelle).toBe('statut-futur');
  });
});
