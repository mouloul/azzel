- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-fondation-du-monorepo.md`
  summary: Tests de composant exécutant ThemeToggle (état initial selon localStorage + système, persistance après bascule, suivi des changements système)
  evidence: La revue de vérification (VG4) constate qu'aucun test n'exécute le composant modifié — les tests couvrent les helpers purs seulement ; introduire jsdom/testing-library dépasse le périmètre de la story fondation, à couvrir avec les premiers tests UI de l'épopée 1.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-import-excel-des-volontaires-et-invitations.md`
  summary: Ajouter un test de rendu du lien statique « Volontaire ? Connecte-toi ici » (a[href="/connexion-volontaire"]) sur la page /connexion
  evidence: Aucun test ne rend /connexion (convention page.test.tsx du repo) ; la suppression ou corruption du href ne ferait échouer aucune suite. Dégradation UX de découverte seulement — l'enveloppe iam.volontaire_code_refused, elle testée, oriente déjà vers /connexion-volontaire (finding verification-gap story 3.1).
- source_spec: none
  summary: Mode sombre avec override mémorisé (pattern UX épopée 6) à implémenter dans une story ultérieure de l'app coureurs
  evidence: Revue 6.1 (finding #19) : l'épopée 6 exige « défaut préférence système, override mémorisé » ; seule la détection système est en place (useColorScheme), aucun contrôle utilisateur.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-guide-permission-ios-autoriser-une-fois.md`
  summary: Harnais de rendu RN runners pour tester écrans (guide permission : échec openSettings, variante Android)
  evidence: Revue 6.3 (finding #14) : vitest.config.ts n'inclut aucun chemin .test.tsx côté runners ; introduire react-test-renderer/@testing-library juste pour deux assertions d'écran serait disproportionné.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4-pédagogie-batterie-et-rappel-j-7.md`
  summary: Alerte batterie < 15 % côté coureur (Should balisé [ASSUMPTION: à confirmer] — exige expo-battery et un choix produit sur le comportement)
  evidence: Epics.md story 6.4 AC3 balise explicitement Should/à confirmer ; aucune dépendance batterie installée dans apps/runners.
