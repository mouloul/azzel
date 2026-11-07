import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@azzel/shared'],
  // Recette terrain : le serveur de développement n'accepte que localhost et
  // l'hôte de démarrage. Un tunnel HTTPS (ngrok) est indispensable pour tester
  // la caméra, le service worker et l'installation PWA depuis un téléphone —
  // tous exigent un contexte sécurisé, qu'une IP locale en HTTP ne donne pas.
  // Sans effet en production : Next ne lit cette clé qu'en développement.
  allowedDevOrigins: [
    '*.ngrok-free.app',
    '*.ngrok-free.dev',
    '*.ngrok.app',
    '*.ngrok.io',
    '*.trycloudflare.com',
  ],
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
      {
        // Story 4.1 — même ceinture documentaire pour le SW e-dossard : la
        // frontière est /espace-coureur, jamais ailleurs.
        source: '/sw-coureur.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/espace-coureur' },
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
