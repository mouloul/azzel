import { afterEach, describe, expect, it, vi } from 'vitest';

import { estErreurDelai, fetchAvecDelai } from './fetch-delai';

const timeoutOrigine = AbortSignal.timeout;

afterEach(() => {
  AbortSignal.timeout = timeoutOrigine;
  vi.restoreAllMocks();
});

describe('fetchAvecDelai', () => {
  it('part quand même sur un navigateur sans AbortSignal.timeout (Safari < 16)', async () => {
    // @ts-expect-error — on retire l'API pour simuler le navigateur ancien.
    AbortSignal.timeout = undefined;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const reponse = await fetchAvecDelai('/api/admin/sponsors', { method: 'POST' });

    expect(reponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('utilise AbortSignal.timeout quand il existe', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchAvecDelai('/api/admin/sponsors', { method: 'GET' }, 1234);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('estErreurDelai', () => {
  it('reconnaît TimeoutError et AbortError, et rien d’autre', () => {
    expect(estErreurDelai(new DOMException('lent', 'TimeoutError'))).toBe(true);
    expect(estErreurDelai(new DOMException('annulé', 'AbortError'))).toBe(true);
    expect(estErreurDelai(new TypeError('réseau'))).toBe(false);
    expect(estErreurDelai(null)).toBe(false);
  });
});
