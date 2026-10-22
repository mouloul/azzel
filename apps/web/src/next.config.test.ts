import { describe, expect, it } from 'vitest';

import nextConfig from '../next.config';

// Stories 3.3/4.1 — les SW vivent à la racine de public/ : l'en-tête
// Service-Worker-Allowed énonce leur frontière et le no-cache laisse les
// mises à jour passer. Ce test verrouille les deux, pour chaque SW.

describe('next.config — en-têtes des service workers', () => {
  it('headers() déclare Service-Worker-Allowed: /volontaires + no-cache pour /sw-volontaires.js', async () => {
    expect(typeof nextConfig.headers).toBe('function');
    const configuration = await nextConfig.headers?.();
    const regle = configuration?.find(({ source }) => source === '/sw-volontaires.js');
    expect(regle).toBeDefined();
    const entetes = new Map(regle?.headers.map(({ key, value }) => [key, value]));
    expect(entetes.get('Service-Worker-Allowed')).toBe('/volontaires');
    expect(entetes.get('Cache-Control')).toBe('no-cache');
  });

  it('story 4.1 — idem pour /sw-coureur.js : frontière /espace-coureur', async () => {
    expect(typeof nextConfig.headers).toBe('function');
    const configuration = await nextConfig.headers?.();
    const regle = configuration?.find(({ source }) => source === '/sw-coureur.js');
    expect(regle).toBeDefined();
    const entetes = new Map(regle?.headers.map(({ key, value }) => [key, value]));
    expect(entetes.get('Service-Worker-Allowed')).toBe('/espace-coureur');
    expect(entetes.get('Cache-Control')).toBe('no-cache');
  });
});
