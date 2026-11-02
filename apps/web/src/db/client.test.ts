import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// La fabrique est le point de défaillance unique de la connexion applicative :
// on y vérifie la mémoïsation, le repli sans base et les options posées, sans
// jamais ouvrir de vraie connexion (le module `postgres` est doublé).

const postgresMock = vi.hoisted(() =>
  vi.fn((url: string, options: unknown) => ({ url, options })),
);
const readDatabaseUrlMock = vi.hoisted(() => vi.fn<() => string | null>());
const readEnvMock = vi.hoisted(() => vi.fn<(name: string) => string | null>());

vi.mock('postgres', () => ({ default: postgresMock }));
vi.mock('@/modules/iam/env', () => ({
  readDatabaseUrl: readDatabaseUrlMock,
  readEnv: readEnvMock,
}));

import {
  POOL_MAX_LOCAL,
  POOL_MAX_SERVERLESS,
  databasePoolOptions,
  exigeTls,
  getDbClient,
  isServerlessRuntime,
  resetDbClientForTests,
} from './client';

const DATABASE_URL = 'postgres://azzel_app:secret@127.0.0.1:54329/azzel';

beforeEach(() => {
  resetDbClientForTests();
  postgresMock.mockClear();
  readDatabaseUrlMock.mockReset();
  readEnvMock.mockReset();
  readDatabaseUrlMock.mockReturnValue(DATABASE_URL);
  readEnvMock.mockReturnValue(null);
});

afterEach(() => {
  resetDbClientForTests();
});

describe('getDbClient', () => {
  it('ouvre un pool sur DATABASE_URL et le réutilise à l’appel suivant', () => {
    const premier = getDbClient();
    const second = getDbClient();

    expect(premier).not.toBeNull();
    expect(second).toBe(premier);
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith(DATABASE_URL, databasePoolOptions());
  });

  it('désactive les requêtes préparées — un pooler en mode transaction ne les supporte pas', () => {
    getDbClient();

    const [, options] = postgresMock.mock.calls[0] as [string, { prepare: boolean }];
    expect(options.prepare).toBe(false);
  });

  it('retourne null sans DATABASE_URL, sans ouvrir de connexion ni lever', () => {
    readDatabaseUrlMock.mockReturnValue(null);

    expect(getDbClient()).toBeNull();
    expect(postgresMock).not.toHaveBeenCalled();
  });

  it('ne mémoïse pas l’absence : une DATABASE_URL apparue plus tard est prise en compte', () => {
    readDatabaseUrlMock.mockReturnValueOnce(null);

    expect(getDbClient()).toBeNull();
    expect(getDbClient()).not.toBeNull();
    expect(postgresMock).toHaveBeenCalledTimes(1);
  });

  it('ouvre le pool avec les options réduites quand l’environnement est serverless', () => {
    readEnvMock.mockImplementation((name) => (name === 'VERCEL' ? '1' : null));

    getDbClient();

    const [, options] = postgresMock.mock.calls[0] as [string, { max: number }];
    expect(options.max).toBe(POOL_MAX_SERVERLESS);
  });
});

describe('databasePoolOptions', () => {
  it('conserve les valeurs locales historiques hors serverless', () => {
    expect(databasePoolOptions()).toEqual({
      max: POOL_MAX_LOCAL,
      connect_timeout: 5,
      idle_timeout: 20,
      prepare: false,
    });
    expect(isServerlessRuntime()).toBe(false);
  });

  it('réduit la taille du pool quand l’environnement signale le serverless', () => {
    readEnvMock.mockImplementation((name) => (name === 'VERCEL' ? '1' : null));

    expect(isServerlessRuntime()).toBe(true);
    expect(databasePoolOptions().max).toBe(POOL_MAX_SERVERLESS);
  });

  it('reconnaît aussi un exécutant Lambda', () => {
    readEnvMock.mockImplementation((name) =>
      name === 'AWS_LAMBDA_FUNCTION_NAME' ? 'azzel-web' : null,
    );

    expect(databasePoolOptions().max).toBe(POOL_MAX_SERVERLESS);
  });
});

describe('exigeTls', () => {
  // Le mot de passe et les données personnelles des coureurs traversent le
  // réseau : une base distante se joint chiffrée, et le repli sûr n'est jamais
  // le clair. Ces cas échouent si quelqu'un retire la règle.
  it('exige TLS pour un hôte distant', () => {
    expect(exigeTls('postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres')).toBe(
      true,
    );
    expect(exigeTls('postgresql://u:p@db.exemple.supabase.co:5432/postgres')).toBe(true);
  });

  it('laisse une base locale en clair', () => {
    expect(exigeTls('postgres://azzel_app:azzel@localhost:54329/azzel')).toBe(false);
    expect(exigeTls('postgres://azzel_app:azzel@127.0.0.1:54329/azzel')).toBe(false);
  });

  it("exige TLS quand l'URL est illisible — le doute ne profite pas au clair", () => {
    expect(exigeTls('pas-une-url')).toBe(true);
  });

  it('pose ssl: require dans les options pour une base distante, pas en local', () => {
    expect(
      databasePoolOptions('postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres').ssl,
    ).toBe('require');
    expect(databasePoolOptions('postgres://u:p@localhost:54329/azzel').ssl).toBeUndefined();
  });
});
