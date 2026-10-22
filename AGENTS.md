# AGENTS.md — Conventions projet Azzel

## Recette par épopée (règle applicable à TOUTES les épopées)

À la **clôture de chaque épopée** (dernière story `done`), produire un document de scénarios de recette :

- **Emplacement :** `_bmad-output/implementation-artifacts/scenarios-recette-epic-<N>.md`
- **Contenu :** un module par story — préconditions, étapes numérotées concrètes (navigateur, Mailpit, psql selon le cas), résultat attendu par étape, cases à cocher, tableau de synthèse final (module × statut × observations). Rédigé pour un testeur humain : aucune connaissance du code requise.
- **Prérequis d'environnement en tête de document** (commandes exactes : dev-db.sh, dev-mail.sh, db:migrate, variables d'env).
- **Statut :** le document est livré avec le commit de clôture de l'épopée et référencé dans le rapport de session.
- Référence : `scenarios-recette-epic-1.md` (épopée 1) sert de gabarit.

Cette règle s'applique aussi aux épopées à venir (2 vitrine, 3 volontaires, 4 chrono, 5 PC, 6 app coureurs, 7 extérieur).
