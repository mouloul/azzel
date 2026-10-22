import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@azzel/shared'],
  async headers() {
    return [
      {
        // Story 3.3 — Service-Worker-Allowed ÉLARGIT la portée maximale
        // autorisée pour un SW servi à la racine (défaut : /). Le scope
        // demandé ici (/volontaires) est PLUS ÉTROIT que ce maximum :
        // l'enregistrement fonctionnerait sans l'en-tête — on le garde comme
        // ceinture documentaire qui énonce la frontière volontaires, et le
        // no-cache laisse les mises à jour du SW passer.
        source: '/sw-volontaires.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/volontaires' },
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
