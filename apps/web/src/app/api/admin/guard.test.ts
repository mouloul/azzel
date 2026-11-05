import { describe, expect, it } from 'vitest';

import { adminErrorResponse } from './guard';

const ENVELOPE = {
  version: 1,
  error: { code: 'admin.reglages_invalides', message: 'Réglages invalides.', action: 'Corrige.' },
};

describe('adminErrorResponse', () => {
  it('sans erreur par champ : l’enveloppe seule, comme avant', async () => {
    const reponse = adminErrorResponse({ status: 400, envelope: ENVELOPE } as never);
    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual(ENVELOPE);
  });

  it('avec erreurs par champ : elles sont renvoyées, pour que l’écran désigne le champ fautif', async () => {
    const reponse = adminErrorResponse({
      status: 400,
      envelope: ENVELOPE,
      fields: { capacite: 'Indique un nombre entier positif.' },
    } as never);
    const corps = (await reponse.json()) as { fields?: Record<string, string> };
    expect(corps.fields).toEqual({ capacite: 'Indique un nombre entier positif.' });
  });
});
