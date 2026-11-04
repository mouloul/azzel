# Revue de code indépendante — épopée 10 (refonte des surfaces d'exploitation)

Projet `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `review/epopee-9-10`.
Tu es **reviewer adversarial**, pas développeur. Je suis l'architecte/PO. Les stories 10.1 à 10.4
ont été implémentées sans aucune revue de code indépendante ; c'est le but de cette session.

**Périmètre du diff** : `git diff 78de2c6..ee3a572 -- apps packages` (code et tests des stories
10.1 à 10.4 ; les fichiers `_bmad-output` sont du contexte, pas du code à relire sauf les specs
`spec-10-*.md` pour connaître l'intention). Lis les AC de ces stories dans
`_bmad-output/planning-artifacts/epics.md` (« Epic 10 »).

**Mode lecture seule strict** : tu ne modifies AUCUN fichier de code ni de test, tu n'exécutes aucune
commande git en écriture. **N'exécute NI `pnpm test` NI `pnpm budget`** (une autre session les lance en parallèle sur la même base : conflit). Tu peux exécuter `pnpm typecheck`, des `grep`,
`git diff/show/log`. Le Postgres de dev doit rester allumé (ne l'arrête pas ; les tests
d'intégration en ont besoin). Un seul fichier à écrire :
`_bmad-output/implementation-artifacts/revue-epopee-10.md`.

Utilise le skill `bmad-code-review` (trois couches : chasseur aveugle, cas limites, vérification
des lacunes) ou, à défaut, fais ces trois lectures toi-même. **Chaque constat doit être prouvé**
(fichier:ligne, extrait ou commande + sortie) : un constat non démontré est rejeté. Cherche
en particulier ce qu'une implémentation rapide laisse passer :

- **Régressions de comportement** cachées par des tests réalignés : compare les tests modifiés
  (`git diff` des `*.test.*`) à leur version d'origine ; signale toute assertion supprimée,
  assouplie ou dont l'intention a changé, avec la preuve avant/après.
- **Accessibilité réelle** : labels, ordre du focus, `aria-*` erronés, cibles < 44 px calculables
  depuis le CSS, contrastes < 4,5:1 (calcule-les), liens sans nom accessible, `:has()` sans repli.
- **Vérité des données publiques** : tout chiffre affiché qui n'a pas de source (NFR-7 : jamais de
  nom de coureur sur un canal public ; « aucun chiffre inventé »), tout texte contredit par la base.
- **Budget et performance** : ce qui entre dans le HTML/JS de l'accueil, polices, ressources
  bloquantes ; vérifie les affirmations des specs (« budget 279 Kio », « 321 Kio transférés »).
- **Sécurité** : XSS (`dangerouslySetInnerHTML`, liens `javascript:`), entrées de formulaire
  non validées côté serveur, fuite d'information, URL ouvertes sans `rel`.
- **Qualité du code** : duplication, CSS mort (classes jamais utilisées), `!important`,
  sélecteurs fragiles, tests qui ne testent rien (assertions tautologiques, `toBeTruthy` sur
  une chaîne, lecture de source au lieu de comportement quand le comportement était testable).
- **Cohérence avec les specs** : critère d'acceptation non satisfait ou satisfait en apparence.

Points d'attention propres à l'épopée 10 : les stories 10.1–10.3 prétendent que le voyant de scan
était déjà conforme (UX-DR-7), que le service worker précache le socle, et que le rendu hors-ligne est
inchangé — vérifie ces trois affirmations dans le code (ne les crois pas). Les compteurs de
`/admin/dossiers` : le libellé correspond-il à ce qui est compté ? Les tests de lecture de source de
`apps/runners` et les contrastes de 10.4 testent-ils quelque chose de réel ? Le bouton
« Se déconnecter » destructeur de l'app coureurs : quelles sont ses conséquences réelles ?

## Format du rapport (`revue-epopee-10.md`)

Un tableau par sévérité — **Bloquant** (défaut avéré, bug, régression, faille) / **Important**
(écart aux AC, dette qui mord bientôt) / **Mineur** — avec colonnes : `#`, story, constat,
preuve (fichier:ligne + extrait), correctif proposé, effort (S/M/L). Puis une section
« **Constats réfutés** » (ce que tu as soupçonné et prouvé faux) et une section « **Non
vérifiable ici** ». Ne gonfle pas : 5 constats prouvés valent mieux que 30 impressions. Si une
catégorie est propre, dis-le avec ce que tu as vérifié. Pas de chinois.
