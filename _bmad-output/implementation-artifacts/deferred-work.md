- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-fondation-du-monorepo.md`
  summary: Tests de composant exécutant ThemeToggle (état initial selon localStorage + système, persistance après bascule, suivi des changements système)
  evidence: La revue de vérification (VG4) constate qu'aucun test n'exécute le composant modifié — les tests couvrent les helpers purs seulement ; introduire jsdom/testing-library dépasse le périmètre de la story fondation, à couvrir avec les premiers tests UI de l'épopée 1.
