import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Story 3.1 rouverte (connexion par code unifiée) : l'ancien accès volontaire
// par mot de passe n'a plus de route. On vérifie l'absence du RÉPERTOIRE de
// route (quelle que soit l'extension page/route .tsx/.ts/.jsx/.js) : ce test
// empêche qu'une page ou une API de ce flux réapparaisse.
const APP_DIR = fileURLToPath(new URL('.', import.meta.url));

const REPERTOIRES_SUPPRIMES = [
  'invitation',
  'connexion-volontaire',
  'api/iam/invitation',
  'api/iam/connexion-volontaire',
];

describe('routes du flux mot de passe volontaire', () => {
  it.each(REPERTOIRES_SUPPRIMES)('%s/ : répertoire de route absent', (repertoire) => {
    expect(existsSync(`${APP_DIR}${repertoire}`)).toBe(false);
  });

  it('la connexion unique tous rôles existe', () => {
    expect(existsSync(`${APP_DIR}connexion/page.tsx`)).toBe(true);
  });
});
