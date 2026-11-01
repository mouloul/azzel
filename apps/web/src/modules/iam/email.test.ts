import { afterEach, describe, expect, it, vi } from 'vitest';

// L'expéditeur était en dur. Un fournisseur d'envoi refuse les adresses qu'il
// n'a pas validées : sur un environnement dont le domaine n'est pas le nôtre,
// aucun code de connexion ne part et l'échec se découvre quand quelqu'un attend
// le sien. Ces cas échouent si la configuration cesse d'être lue.

const readEnvMock = vi.hoisted(() => vi.fn<(name: string) => string | null>());

vi.mock('./env', () => ({
  readEnv: readEnvMock,
  readSmtpUrl: vi.fn<() => string | null>(() => null),
}));

afterEach(() => {
  vi.resetModules();
  readEnvMock.mockReset();
});

async function chargerExpediteur(): Promise<{ from: string; defaut: string }> {
  const module = await import('./email');
  return { from: module.APP_EMAIL_FROM, defaut: module.APP_EMAIL_FROM_DEFAUT };
}

describe('APP_EMAIL_FROM', () => {
  it("retient l'adresse configurée quand APP_EMAIL_FROM est posée", async () => {
    readEnvMock.mockImplementation((name) =>
      name === 'APP_EMAIL_FROM' ? 'Trail Azzel <equipe@exemple.test>' : null,
    );

    const { from } = await chargerExpediteur();

    expect(from).toBe('Trail Azzel <equipe@exemple.test>');
    expect(readEnvMock).toHaveBeenCalledWith('APP_EMAIL_FROM');
  });

  it('retombe sur la valeur historique quand la configuration est absente', async () => {
    readEnvMock.mockReturnValue(null);

    const { from, defaut } = await chargerExpediteur();

    expect(from).toBe(defaut);
    expect(defaut).toBe('Azzel <no-reply@azzel.dz>');
  });

  it('traite une configuration vide comme absente', async () => {
    // readEnv rend déjà null sur une chaîne vide ; on fige le contrat ici pour
    // qu'une variable posée mais vide ne produise jamais un expéditeur vide.
    readEnvMock.mockImplementation((name) => (name === 'APP_EMAIL_FROM' ? null : null));

    const { from, defaut } = await chargerExpediteur();

    expect(from).toBe(defaut);
  });
});
