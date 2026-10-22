import { describe, expect, it } from 'vitest';

import nextConfig from '../next.config';

// Story 3.3 — le SW volontaires vit à la racine de public/ : l'en-tête
// Service-Worker-Allowed énonce sa frontière (/volontaires) et le no-cache
// laisse les mises à jour passer. Ce test verrouille les deux.

describe('next.config — en-têtes du service worker volontaires', () => {
  it('headers() déclare Service-Worker-Allowed: /volontaires + no-cache pour /sw-volontaires.js', async () => {
    expect(typeof nextConfig.headers).toBe('function');
    const configuration = await nextConfig.headers?.();
    const regle = configuration?.find(({ source }) => source === '/sw-volontaires.js');
    expect(regle).toBeDefined();
    const entetes = new Map(regle?.headers.map(({ key, value }) => [key, value]));
    expect(entetes.get('Service-Worker-Allowed')).toBe('/volontaires');
    expect(entetes.get('Cache-Control')).toBe('no-cache');
  });
});
