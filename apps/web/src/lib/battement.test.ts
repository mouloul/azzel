import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { battement, terminerAvecBattement } from './battement';

const ancienExitCode = process.exitCode;

beforeEach(() => {
  process.exitCode = undefined;
  delete process.env.HEARTBEAT_URL_TEST;
});

afterEach(() => {
  process.exitCode = ancienExitCode;
  delete process.env.HEARTBEAT_URL_TEST;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function espionFetch(reponse: () => Promise<Response>) {
  const spy = vi.fn((_url: string, _init?: RequestInit) => reponse());
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('battement', () => {
  it('ne fait aucun appel sans URL', async () => {
    const spy = espionFetch(async () => new Response('ok'));
    await battement('TEST', 'succes');
    expect(spy).not.toHaveBeenCalled();
  });

  it('appelle l’URL en cas de succès', async () => {
    process.env.HEARTBEAT_URL_TEST = 'https://hc.example/abc';
    const spy = espionFetch(async () => new Response('ok'));
    await battement('TEST', 'succes');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe('https://hc.example/abc');
  });

  it('appelle l’URL suffixée /fail en cas d’échec', async () => {
    process.env.HEARTBEAT_URL_TEST = 'https://hc.example/abc/';
    const spy = espionFetch(async () => new Response('ok'));
    await battement('TEST', 'echec');
    expect(spy.mock.calls[0]?.[0]).toBe('https://hc.example/abc/fail');
  });

  it('avale une erreur réseau et une réponse 500', async () => {
    process.env.HEARTBEAT_URL_TEST = 'https://hc.example/abc';
    espionFetch(async () => {
      throw new Error('réseau');
    });
    await expect(battement('TEST', 'succes')).resolves.toBeUndefined();
    espionFetch(async () => new Response('boom', { status: 500 }));
    await expect(battement('TEST', 'succes')).resolves.toBeUndefined();
  });
});

describe('terminerAvecBattement', () => {
  it('envoie un battement de succès quand exitCode reste nul', async () => {
    process.env.HEARTBEAT_URL_TEST = 'https://hc.example/abc';
    const spy = espionFetch(async () => new Response('ok'));
    await terminerAvecBattement('TEST', async () => {});
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe('https://hc.example/abc');
  });

  it('signale l’échec quand exitCode vaut 1, et le conserve', async () => {
    process.env.HEARTBEAT_URL_TEST = 'https://hc.example/abc';
    const spy = espionFetch(async () => new Response('ok'));
    await terminerAvecBattement('TEST', async () => {
      process.exitCode = 1;
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe('https://hc.example/abc/fail');
    expect(process.exitCode).toBe(1);
  });

  it('signale l’échec sur exception non rattrapée, code de sortie à 1', async () => {
    process.env.HEARTBEAT_URL_TEST = 'https://hc.example/abc';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const spy = espionFetch(async () => new Response('ok'));
    await terminerAvecBattement('TEST', async () => {
      throw new Error('boum');
    });
    expect(spy.mock.calls[0]?.[0]).toBe('https://hc.example/abc/fail');
    expect(process.exitCode).toBe(1);
  });

  it('garde son code de sortie quand le moniteur est en panne', async () => {
    process.env.HEARTBEAT_URL_TEST = 'https://hc.example/abc';
    espionFetch(async () => new Response('boom', { status: 500 }));
    await terminerAvecBattement('TEST', async () => {
      process.exitCode = 1;
    });
    expect(process.exitCode).toBe(1);
  });
});
