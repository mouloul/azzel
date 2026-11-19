import { afterEach, describe, expect, it, vi } from 'vitest';

const getDbClient = vi.fn();
vi.mock('@/db/client', () => ({ getDbClient: () => getDbClient() }));

import { DELAI_SANTE_MS, GET } from './route';

afterEach(() => {
  vi.useRealTimers();
  getDbClient.mockReset();
});

function sqlQuiRepond(requete: () => Promise<unknown>) {
  return Object.assign(() => requete(), {});
}

describe('GET /api/sante', () => {
  it('200 {"ok":true} quand la base répond', async () => {
    getDbClient.mockReturnValue(sqlQuiRepond(async () => [{ '?column?': 1 }]));
    const reponse = await GET();
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ ok: true });
    expect(reponse.headers.get('Cache-Control')).toBe('no-store');
  });

  it('503 {"ok":false} sans DATABASE_URL', async () => {
    getDbClient.mockReturnValue(null);
    const reponse = await GET();
    expect(reponse.status).toBe(503);
    expect(await reponse.json()).toEqual({ ok: false });
    expect(reponse.headers.get('Cache-Control')).toBe('no-store');
  });

  it('503 {"ok":false} quand getDbClient lève', async () => {
    getDbClient.mockImplementation(() => {
      throw new Error('configuration invalide');
    });
    const reponse = await GET();
    expect(reponse.status).toBe(503);
    expect(await reponse.json()).toEqual({ ok: false });
  });

  it('503 sans détail quand la requête échoue', async () => {
    getDbClient.mockReturnValue(
      sqlQuiRepond(async () => {
        throw new Error('connexion refusée postgres://secret@hote');
      }),
    );
    const reponse = await GET();
    expect(reponse.status).toBe(503);
    expect(await reponse.text()).toBe('{"ok":false}');
  });

  it('503 quand la base reste muette au-delà du délai', async () => {
    vi.useFakeTimers();
    getDbClient.mockReturnValue(sqlQuiRepond(() => new Promise(() => {})));
    const enCours = GET();
    await vi.advanceTimersByTimeAsync(DELAI_SANTE_MS + 1);
    const reponse = await enCours;
    expect(reponse.status).toBe(503);
    expect(reponse.headers.get('Cache-Control')).toBe('no-store');
  });
});
