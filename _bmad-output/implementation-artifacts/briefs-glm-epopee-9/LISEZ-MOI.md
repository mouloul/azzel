# Briefs de l'épopée 9 — registre de ce qui a été demandé

Ces fichiers sont les briefs envoyés à GLM (via `opencode run`) pour implémenter les stories de
l'épopée 9. Ils ont été conservés ici parce qu'ils sont, avec les commits, la seule trace de
l'instruction réellement donnée : les stories 9.x n'ont pas eu de spec écrite avant le code, ce
qui s'écarte de la convention des stories 1 à 8. Les `spec-9-*.md` voisines ont été
reconstituées après coup à partir de ces briefs et des commits.

Un brief par session : `opencode run -c` (reprise de session) s'est révélé peu fiable, donc
chaque brief est **autonome** — il décrit l'état du dépôt, la baseline de tests et les
interdits. Les fichiers `story-9-3-budget.md` et `story-9-5-tests.md` sont des tâches de
correction envoyées après la livraison initiale (budget dépassé de 1 326 octets ; tests
manquants sur la logique de filtrage).

## Lanceur

`lance-glm.sh <brief.md> <sortie.txt> <titre>` relance `opencode run --pure` tant qu'il ne
produit aucune sortie dans les 90 secondes. Cause constatée : un blocage intermittent au
démarrage (le journal s'arrête à l'étape `init`, sans session créée), parfois pendant des
heures. Sans ce garde-fou, un run bloqué ne meurt jamais et ne notifie jamais.

Les chemins du script (`cd` vers le dépôt) sont ceux de la machine où il a été écrit.
