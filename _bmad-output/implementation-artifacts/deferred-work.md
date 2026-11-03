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
- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-classements-par-épreuve-et-départs-échelonnés.md`
  summary: Classement par sexe (balisé [ASSUMPTION: crédibilité fédération]) — exige d'ajouter la donnée sexe au formulaire d'inscription et au modèle
  evidence: Epics.md 7.1 AC2 : aucune colonne sexe n'existe (grep vide sur le schéma inscriptions) ; ajout = évolution du formulaire public + migration, à confirmer produit.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-classements-par-épreuve-et-départs-échelonnés.md`
  summary: Epingler NFR-4 par un test de lecture classements PENDANT une sync concurrente
  evidence: Revue 7.1 (finding #4) : garantie structurelle (une transaction withOrg) ; le harnais d'intégration du dépôt n'injecte pas d'écritures concurrentes pendant une lecture.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-résultats-en-direct-partageables.md`
  summary: Harnais d'exécution d'effets client (jsdom/faux timers/e2e) pour tester les boucles de polling (resultats-live, course-live)
  evidence: Revue 7.2 (finding #14) : vitest env node, zéro DOM, zéro e2e dans le dépôt ; le polling admin 5.1 vit dans le même état.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-3-carte-publique-anonyme.md`
  summary: Marqueurs de checkpoints sur la carte publique — exige d'ajouter lat/lon aux secteurs/missions (aucune coordonnée dans le modèle)
  evidence: Revue pré-spéc 7.3 : tables secteur (nom, lieu text) et mission sans géométrie ; l'AC épopée mentionne « tracé GPX + checkpoints » mais le modèle ne porte pas de coordonnées de checkpoint.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-3-carte-publique-anonyme.md`
  summary: Cache/proxy de tuiles OSM + identification client (usage policy) pour la carte publique jour J
  evidence: Revue 7.3 (finding #14) : tuiles servies directement par tile.openstreetmap.org à un public massif ; la policy OSM demande identification/limitation au-delà d'un usage modéré.

## Deferred from: code review of epic-2-context (2026-10-28)

- **Deux échelles typographiques parallèles** [apps/web/src/app/tokens-synchronises.css:100 ; apps/web/src/app/globals.css:749-750] — les surfaces admin/auth consomment `var(--az-font-size-*)` (corps 15 px) tandis que les classes `aa-` de la vitrine codent les tailles en dur (`.aa-h2` 36 px, `.aa-lead` 19 px, `.aa-card__text` 14 px). Même rôle sémantique, deux valeurs. Différé : le correctif propre est de faire émettre les tailles `aa-` par `src/lib/tokens-css.ts`, soit une refonte de la génération de tokens, pas une correction directe.
- **Mémo `slug → organisationId` sans invalidation en production** [apps/web/src/db/org-scope.ts:46] — `Map` au niveau module, purgée uniquement par `resetOrganisationIdMemoForTests`. Un slug recréé ou réaffecté sert un `organisation_id` périmé jusqu'au redéploiement. A déjà silencieusement faussé un test (`iam.integration.test.ts:263`, reset ajouté à ce seul endroit). Différé : en production les slugs sont stables ; le besoin disparaît si l'arbitrage sur le rendu dynamique de l'accueil retire le `force-dynamic`.
- **Le garde anti-dérive de `tokens-synchronises.css` ne peut pas échouer en CI** [apps/web/src/lib/tokens-css.test.ts:10-24 ; .github/workflows/ci.yml:79,87] — `pnpm build` exécute `tokens:sync` et régénère le fichier avant `pnpm test` : la comparaison s'auto-satisfait. Un `siteTokens` modifié sans `tokens:sync` passe le CI avec un artefact committé périmé. Différé : le correctif est une étape CI (`pnpm -F @azzel/web tokens:sync && git diff --exit-code`), hors du périmètre de ce changement.
- **`/api/volontaires/sync` : corps chunké contourne la borne 1 Mo** [apps/web/src/app/api/volontaires/sync/route.ts:45-49] — la garde ne s'applique que si `content-length` est présent ; `apps/web/src/app/api/coureur/tracking/sync/route.ts:50-54` a corrigé le point (« ABSENT (corps chunké) : refusé pareil — la garde ne se contourne pas ») sans rétroportage. Différé : préexistant (épopée 3), non causé par l'épopée 2.
- **Aucun test pour les trois managers clients admin** [apps/web/src/app/admin/{contenus,sponsors,retour-images}/*-manager.tsx] — ~45 Ko de logique non testée (verrou optimiste, mapping d'erreurs par champ, focus sur premier champ fautif, replis de timeout, bascule A/B), alors que le projet teste ses composants clients ailleurs (`resultats-live.test.tsx`, `volontaires/scan/page.test.tsx`). Différé : dette de test, à planifier comme lot.
- **Triple duplication des helpers admin** [apps/web/src/app/api/admin/{contenus,sponsors,retour-images}/body.ts ; les trois `*-manager.tsx`] — `readJsonBody`/`errorResponse` copiés à l'identique, `NETWORK_ERROR`/`TIMEOUT_ERROR`/`lireErreur` copiés dans les trois managers, avec divergences déjà constatées. Différé : la factorisation est un refactor ; les divergences individuelles sont traitées séparément.
- **Trailer public sans sous-titres ni bac à sable** [apps/web/src/app/retour-en-images/trailer-bloc.tsx:34-36] — `<video>` sans `<track kind="captions">` ni transcription, `<iframe>` sans `sandbox`. Différé : dépend de la matière 1ʳᵉ édition, question ouverte de l'épopée.
- **Cookie de session périmé jamais effacé à la redirection** [apps/web/src/modules/iam/session.ts:97-99] — `requireRolePage`/`requireSession` redirigent vers `/connexion` sans supprimer `azzel_session` : le navigateur le réémet à chaque navigation, ce qui déclenche une requête SQL inutile avant chaque redirection. Différé : Next refuse toute écriture de cookie pendant le rendu d'un composant serveur (« Cookies can only be modified in a Server Action or Route Handler ») ; le correctif passe par un aller-retour vers `/api/auth/logout`, soit plus de complexité que le bruit qu'il évite.
- **Quota par IP consommé avant l'envoi du code** [apps/web/src/modules/iam/service.ts] — `recordCodeRequestIp` s'exécute avant `insertLoginCode`/`sendCode` : un échec d'envoi brûle quand même le quota de l'appelant. Conservé tel quel à dessein — la vérification et l'insertion sont atomiques sous verrou consultatif, et les dissocier rouvrirait la course que ce verrou ferme. À reprendre seulement si des utilisateurs légitimes se retrouvent bloqués.

## Deferred from: code review of epic-2-context — groupe 2, backend (2026-10-28)

- **Revue incomplète** — 4 des 5 couches de relecture (Edge Case Hunter, Verification Gap, Acceptance Auditor, audit RLS/multi-organisation) ont été coupées par la limite de session avant de rendre leur rapport. Seule la couche Blind Hunter a livré. Le backend de l'épopée 2 (modules sponsors/contenus/retour-images, migrations 0010/0014/0015, socle RLS, budget, CI) n'a donc reçu qu'une passe sur cinq : à relancer.
- **Triplication de la plomberie de store, et trois pools de connexions supplémentaires** [apps/web/src/modules/{contenus,retour-images,sponsors}/store.ts] — `CONNECTION_ERROR_CODES`, `isConnectionError`, `withDb`, `createUnavailableStore` et le singleton `globalThis.__azzel*Store` sont copiés à l'identique (~60 lignes × 3). Chaque module ouvre son propre `postgres(databaseUrl, { max: 5 })` : 15 connexions par instance Node en plus de celle de l'IAM, pour la même base. Différé : la factorisation (`@/db/module-store` + pool partagé) est un refactor transverse, pas une correction directe.
- **Mémo `slug → organisationId` : les suites d'intégration de l'épopée 2 n'appellent pas le reset** [apps/web/src/db/org-scope.ts:46] — complète l'entrée du groupe 1. `recreateAzzelTestDb` recrée la base, donc l'id d'organisation change entre suites, mais `sponsors`, `contenus` et `retour-images` integration tests n'appellent pas `resetOrganisationIdMemoForTests()` (seul `org-scope.test.ts` le fait). Elles passent aujourd'hui grâce à l'ordre d'exécution de vitest, que rien n'épingle.
- **Budget : unité de mesure à confirmer** [scripts/check-budget.sh] — l'en-tête annonce mesurer le poids « tel que servi (gzip si le serveur compresse) », mais les mesures utilisent `curl --compressed` avec `-w '%{size_download}'`. Selon la version de curl, `size_download` peut compter les octets APRÈS décodage : le budget serait alors mesuré décompressé, donc plus strict que décrit. À trancher en comparant `size_download` et l'en-tête `Content-Length` sur une même ressource.
- **Test de concurrence des témoignages non probant** [apps/web/src/modules/retour-images/retour-images.integration.test.ts:155] — « deux créations parallèles à 5, une seule passe » lance deux `createTemoignage` en `Promise.allSettled`, mais la fenêtre entre `count(*)` et `INSERT` est trop courte pour que les transactions se chevauchent : le test équivalent côté sponsors passait AUSSI une fois le verrou retiré (vérifié). Il ne prouve donc pas le verrou consultatif qu'il prétend garder. Correctif : le pattern déterministe désormais utilisé pour `createSponsor` (tenir soi-même `pg_advisory_xact_lock` sur une autre connexion, vérifier que la création attend). Découvert pendant la correction du groupe 2, hors des 8 patches validés.

## Deferred from: code review of spec-3-1-import-excel-des-volontaires-et-invitations.md (2026-10-28)

- Ni correction ni suppression d'un volontaire côté admin : un email mal saisi à l'import crée un compte fantôme permanent (invitation en file, liste admin) et bloque même un futur coureur sur cette adresse (« compte volontaire »). Fonctionnalité hors périmètre 3.1 (CRUD volontaire) — `apps/web/src/modules/missions/store.ts`.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-connexion-code-unifiee.md`
  summary: Le migrateur n'exige pas BYPASSRLS — si le rôle propriétaire ne l'a pas (0008 avale `insufficient_privilege` en NOTICE), les UPDATE de backfill d'une migration s'exécutent sous FORCE RLS sans GUC et peuvent toucher 0 ligne avant un DROP destructif (cas de 0035 : backfill `activated_at` / `invitation_outbox_id` puis DROP TABLE invitation).
  evidence: `modules/inscriptions/migrations/0008*.sql:47-62` (exception avalée) ; `modules/inscriptions/migrate.ts:75-83` (aucun contrôle de rôle avant `tx.unsafe`). Sans effet aujourd'hui (owner dev = superuser, aucune donnée volontaire hors dev — choix Q2 du SCP 2026-10-28), mais toute future migration avec backfill en production est exposée. Correctif : garde `rolbypassrls` dans `migrate.ts` (refus explicite) — défaut antérieur à cette story.

## Deferred from: code review of spec-3-2-secteurs-et-missions-typées.md (2026-10-29)

- Test « concurrence affectations » (`modules/missions/secteurs.integration.test.ts:421`) non déterministe : `Promise.all` sans barrière sur un pool `max: 2` — la suppression du `FOR UPDATE` volontaire dans `affecter` n'est détectée que si les deux transactions se chevauchent réellement. Rendre déterministe avec une transaction tenue ouverte (outillage à mutualiser avec le test d'entrelacement `deleteSecteur`).

## Deferred from: code review of spec-3-4-préchargement-de-l-annuaire-des-coureurs.md (2026-10-29)

- Orchestration client de l'annuaire dans `volontaires-pwa.tsx` (états « non enregistré », délai, 401/403, réécriture de la poche après repli) sans test d'effet : aucun harnais DOM dans le dépôt (même décision d'outillage que BF3/BF4 de la 3.4 passe 1 et BF5/VG4 de la 3.3). Réduire l'écart en extrayant les branches restantes en fonctions pures, ou introduire un harnais DOM (happy-dom/jsdom) pour la surface volontaires.

## Deferred from: build de spec-accueil-hero-mon-trail.md (2026-10-31)

- source_spec: `_bmad-output/implementation-artifacts/spec-accueil-hero-mon-trail.md`
  summary: Le hero plein écran de l'accueil n'a pas de variante photo au-delà de 1280 px ; l'image LCP est agrandie (floue) sur écran ≥ 1920 px ou haute densité.
  evidence: `public/charte/photos-2026/` ne contient que des variantes 640 et 1280 ; nécessite un nouvel export depuis les originaux et un arbitrage avec le budget de premier chargement.
- source_spec: `_bmad-output/implementation-artifacts/spec-accueil-hero-mon-trail.md`
  summary: Le câblage des effets de l'onglet « Mon trail » (lecture de session à l'ouverture seulement, focus/Échap/clic extérieur via `activerEncart`) n'est couvert par aucun test qui monte le composant.
  evidence: vitest tourne sans environnement DOM ; les tests appellent les fonctions isolées. Il faudrait un environnement jsdom/happy-dom ou un test e2e Playwright de l'onglet.

## Deferred from: build de spec-8-1-fabrique-de-connexion-unique.md (2026-11-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-fabrique-de-connexion-unique.md`
  summary: Quatre stores n'appliquent pas la garde de rôle applicatif `protegerStore` — `missions`, `chrono`, `rapports`, `tracking` — alors que `db/app-role.ts` annonce la garde « appliquée à TOUS les stores ».
  evidence: `apps/web/src/modules/missions/store.ts` (getMissionsStore), `chrono/store.ts` (getChronoStore), `rapports/store.ts` (getRapportsStore), `tracking/store.ts` (getTrackingStore) : le store est construit directement sur `sql`, sans passer par `protegerStore(sql, …, isProductionRuntime())`, contrairement à `inscriptions`, `sponsors`, `contenus`, `retour-images`, `notifications/outbox-store` et à la forme IAM (`createAppRoleGuard`). Conséquence : une `DATABASE_URL` pointant sur le rôle propriétaire (BYPASSRLS) continuerait de servir ces quatre surfaces en production, là où les autres refusent. L'écart préexiste au refactor de connexion 8.1 et n'a pas été corrigé avec lui : mêler un changement de comportement sécurité à un refactor de connexion aurait rendu la revue des deux impossible. Correctif : envelopper les quatre `createXStore(sql)` dans `protegerStore`, puis vérifier que les suites d'intégration de ces modules passent toujours (le proxy rend asynchrones toutes les méthodes du store).

## Point d'arrêt : preuves illisibles depuis l'application déployée (2026-11-02)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-stockage-preuves.md`
  summary: Sur la recette hébergée, télécharger une preuve de paiement depuis l'écran d'administration renvoie HTTP 500 `admin.internal_error`. Non résolu à l'arrêt de la session.
  evidence: |
    CE QUI EST PROUVÉ, À NE PAS REFAIRE
    - La route s'exécute et l'authentification fonctionne : appelée sans session,
      `/api/admin/preuves/<id>` rend un 401 propre avec l'enveloppe `iam.unauthenticated`,
      sur `azzel-moulouls-projects.vercel.app` comme sur `azzel-beta.vercel.app`.
    - Le bucket `preuves` existe, privé, et contient les 38 preuves référencées par la
      base hébergée. Aller-retour vérifié en HTTP direct, et empreintes SHA-256 des
      cinq premières conformes à ce que la table `preuve` déclare.
    - Le chemin de code réel fonctionne depuis un poste : `getProofStore()` rend bien
      `ObjetProofStore`, et `read()` rapporte 805 octets sur une clé du jeu de données.
    - La panne est reproduite à l'identique en local : avec la clé PUBLIABLE, le code
      lève `ObjetProofStoreConfigError`, ce qui donne exactement `admin.internal_error` ;
      avec la clé SECRÈTE, la même lecture rend 805 octets.

    DIAGNOSTIC AU MOMENT DE L'ARRÊT
    `admin.internal_error` signifie que la lecture a LEVÉ (et non rendu « absent », qui
    donnerait `admin.preuve_storage_error`). Les causes possibles sont donc :
    (a) `PROOF_STORAGE_KEY` posée sur Vercel est encore la clé publiable — la garde la
        refuse à la construction ; (b) la clé est secrète mais `PROOF_STORAGE_URL` ou
        `PROOF_STORAGE_BUCKET` sont erronées, ce qui donne `NoSuchBucket` ; (c) la
        variable n'est pas posée sur l'environnement effectivement servi.
    L'hypothèse (a) a été retenue mais non confirmée : la valeur réelle posée sur Vercel
    n'a jamais été constatée, seulement supposée d'après ce qui avait été collé.

    POUR REPRENDRE, DANS CET ORDRE
    1. Lire les journaux d'exécution Vercel pendant une tentative : depuis le correctif
       de la clé publiable, le message nomme la variable fautive en clair. C'est la
       seule observation qui manque, et elle tranche entre (a), (b) et (c).
    2. Constater la valeur réellement posée sur Vercel pour les quatre `PROOF_STORAGE_*`,
       et sur QUELS environnements (Production et Preview), plutôt que de s'en remettre
       à ce qui était prévu.
    3. Vérifier que le déploiement servi porte bien le commit attendu : plusieurs builds
       ont échoué pendant la session, et Vercel continue de servir le dernier build
       réussi, ce qui a fait diagnostiquer du code périmé pendant des heures.

    PIÈGE DE MÉTHODE À RETENIR
    Une clé sans droits ne produit pas « accès refusé » mais « objet introuvable », le
    stockage refusant de révéler le contenu d'un bucket privé. Toute panne de droits se
    présente donc comme une disparition de données. C'est ce qui a fait chercher au
    mauvais endroit ; la garde sur la forme de la clé a été ajoutée pour ça.


## Deferred from: build de la story 9.1 — socle de style partagé (2026-11-02)

- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.1)
  summary: `volontaires/scan/scan.css` pose le fond de l'écran caméra à `#0C1610` avec un commentaire qui annonce `bg-sombre`, alors que `bg-sombre` vaut `#101A14`. Dérive historique non tranchée : soit la valeur devient un token dédié, soit l'écran s'aligne sur `bg-sombre` en acceptant le changement de rendu.
  evidence: la story 9.1 interdisait tout changement de rendu ; le littéral a été figé avec son nombre épinglé dans `apps/web/src/app/css-sans-litteraux.test.ts`. Le `rgba(12,22,16,…)` du voile partage la même base non tokenisée, et `page.test.tsx:301` exige l'opacité 0,96 telle quelle.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.1)
  summary: `#FFD9D6`, encre du bouton d'appel du voyant « dossard inconnu » dans `scan.css`, est une teinte claire du danger qui n'existe dans aucun token. À remonter en token si elle ressert ailleurs.
  evidence: figée en exception épinglée dans `css-sans-litteraux.test.ts` ; aucune variable existante ne vaut cette couleur.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.1)
  summary: Les deux tokens ajoutés par la story — `forest-800` (arrêt sombre du dégradé du poster trailer) et `vert-altitude` (pastille de lecture) — portent des noms choisis par cohérence d'échelle, sans validation de la charte. `vert-altitude` a la même valeur que `action-sombre` côté opérations mais une sémantique vitrine distincte, volontairement découplée.
  evidence: `packages/shared/src/tokens.ts`, section `siteColorTokens` ; épinglage des constantes dans `apps/web/src/app/contrastes.test.ts`.

## Deferred from: build de la story 9.2 — accueil refondu (2026-11-02)

- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.2)
  summary: Le budget de premier chargement de l'accueil est à 306 848 octets, soit 299,7 Kio pour un plafond de 300 Kio (NFR-2). La marge est de 0,3 Kio : la prochaine addition, même minime, le fera passer.
  evidence: mesure sur build frais après la refonte du hero. Le socle de la story 9.1 a dû être importé depuis `layout.tsx` plutôt que depuis la page pour gagner le kilo-octet manquant par fusion de chunk CSS.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.2)
  summary: `socle.css` est importé par `layout.tsx` : il charge donc sur toutes les routes, y compris celles qui ne consomment pas encore ses classes. Choix dicté par le budget, pas par l'architecture.
  evidence: import depuis la page coûtait un chunk CSS séparé et faisait dépasser les 300 Kio. À réexaminer quand les stories 9.4, 9.5 et 10.x auront effectivement consommé le socle partout.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.2)
  summary: Le rail de chiffres clés du hero n'affiche que Date, Épreuves, Départ et Cadre. Les cellules D+, plage d'altitude et nombre de places attendent des valeurs validées par le comité : aucune source officielle n'existe aujourd'hui, et les chiffres de la maquette viennent du relevé d'essai (28 km, D+ 1 280 m), contradictoires avec les 35 km annoncés.
  evidence: la grille cloisonnée est dimensionnée pour les accueillir ; `page.test.tsx` interdit par ailleurs tout objectif 2027 chiffré sur l'accueil.

## Deferred from: build de la story 9.3 — coquille de la section parcours (2026-11-03)

- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.3)
  summary: Sous-ensemble de caractères de Barlow Condensed. Le jeu réellement rendu par les huit pages publiques tient en 69 caractères ; en sous-ensemble prudent (87 caractères, a–z, 0–9, ponctuation française), Barlow 700 passe de 22 444 à 10 940 octets et Barlow 800 de 22 464 à 10 884, soit environ 23 Ko de moins sur le chemin critique.
  evidence: mesuré avec fonttools dans un environnement isolé hors dépôt. Deux réserves : le jeu strict n'inclut pas le « 8 », qu'aucune page publique n'affiche aujourd'hui, ce qui montre sa fragilité ; et les surfaces authentifiées (e-dossard, admin) rendent aussi du Barlow avec des noms de coureurs libres, il faut donc un inventaire ou un fichier pleine plage réservé au dossard.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.3)
  summary: Le sélecteur d'épreuve repose sur `:has()` généré côté serveur, avec un repli en panneaux empilés pour les navigateurs sans `:has()` (Firefox avant la 121). Ce repli n'a été testé sur aucun vieil appareil réel.
  evidence: prévu par la règle `@supports not selector(:has(*))` dans `globals.css` ; vérification uniquement par lecture du CSS.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.3)
  summary: Quand la story 11.1 branchera `parcours.json`, le formatage des nombres devra rester identique côté serveur : `Intl.NumberFormat('fr-FR')` produit une espace fine insécable comme séparateur de milliers, et le rendu comme les tests reposent sur le même moteur.
  evidence: contrat de données `apps/web/src/modules/contenus/section-parcours.ts` ; rendu `apps/web/src/components/section-parcours.tsx`.

## Deferred from: build de la story 9.5 — résultats refondus (2026-11-03)

- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.5)
  summary: Les garanties « un rafraîchissement ne vide pas la recherche » et « Effacer les filtres remet les trois états à zéro » ne sont pas testées en comportement. L'environnement vitest est `node`, sans DOM : la frappe, le polling et le clic ne sont pas simulables. Elles reposent sur le rendu d'un champ contrôlé et sur des regex lues dans le code source (`setSaisieDossard('')`, absence de `key` sur `VueResultats`), ce qui prouve la structure mais pas le comportement.
  evidence: `apps/web/src/app/resultats/resultats-live.test.tsx`. Même limite déjà notée pour l'onglet « Mon trail » (build du 2026-10-31). Décision d'architecture à prendre une fois pour toutes : ajouter jsdom ou happy-dom, ou un test Playwright, ce qui couvrirait les deux surfaces.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.5)
  summary: Quand un filtre ne retient que des dossards d'une épreuve sans heure de départ configurée, les classements affichent « Aucun dossard ne correspond à cette recherche » alors que le dossard apparaît dans « Derniers arrivés ». Cas rare, jour J, documenté par un test de caractérisation et non par une garantie voulue.
  evidence: test « CARACTÉRISATION (à arbitrer) » dans `resultats-live.test.tsx`.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.5)
  summary: Les abandons ne sont filtrés que par dossard, pas par catégorie : le contrat public ne porte pas la catégorie sur les abandons.
  evidence: contrat `ResultatsPublic` dans `packages/shared`.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.5)
  summary: Un champ de recherche par nom est exclu par NFR-7 (canaux publics anonymes). La story avait été rédigée à tort avec « par nom ou dossard » ; texte corrigé dans `epics.md`. Si le comité veut chercher un coureur par nom, il faut une surface authentifiée, pas la page publique.
  evidence: NFR-7 et AD-7 dans `epics.md`.

## Deferred from: build de la story 9.4 — inscription et checklist refondues (2026-11-03)

- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.4)
  summary: Le fil d'étapes n'affiche aucune mention sur les étapes suivantes, ni « À venir » ni état : un coureur qui a sauté une étape via la checklist ne serait pas « à venir » et le fil mentirait. Seules les étapes franchies sont des liens de retour. Le résultat est plus sobre que la maquette ; arbitrage visuel à faire en recette.
  evidence: `apps/web/src/components/fil-etapes.tsx`, 13 tests dans `fil-etapes.test.tsx`.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.4)
  summary: Couvert par construction seulement, faute de DOM dans vitest : la compression canvas et le réessai sans re-sélection du dépôt de preuve (JavaScript de navigation, jamais exécuté en rendu serveur), la gestion du focus sur le premier champ en erreur (`document.getElementById`), et le rendu visuel réel du fil et de la colonne latérale. Le garde `dossier-css.test.ts` lit la feuille, pas le pixel.
  evidence: même limite d'environnement que les stories 9.5 et « Mon trail » ; décision jsdom, happy-dom ou Playwright déjà consignée.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.4)
  summary: Le groupe de boutons radio « épreuve » porte sa mention « obligatoire » dans le texte d'aide du groupe, pas dans un label par bouton. Le compte de huit mentions « (obligatoire) » est épinglé par un test.
  evidence: `apps/web/src/app/inscription/inscription-form.tsx`.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.4)
  summary: `proof-service.ts` expose maintenant `documentsAcceptes` dans son read-model pour que le fil d'étapes de `/preuve` sache si les documents sont acceptés. Seul fichier de service modifié par la story, ajout pur dérivé de champs déjà chargés.
  evidence: `apps/web/src/modules/inscriptions/proof-service.ts`, un test ajouté dans `preuve.test.ts`.

## Deferred from: build de la story 9.6 — non-régression de la vitrine (2026-11-03)

- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.6)
  summary: **Le budget mesuré par `pnpm budget` n'est pas le poids réellement transféré.** `scripts/check-budget.sh` compte les ressources référencées par le HTML servi, `<link rel="preload">` compris ; une police déclarée uniquement en `@font-face` n'y figure pas. La story 9.3 a retiré le préchargement de Barlow Condensed 700 : le décompte est passé de 301 à 279 Kio, mais le navigateur télécharge toujours la police dès qu'un texte en graisse 700 s'affiche. Mesure réelle au harnais CDP, cache désactivé : 321,2 Kio sur `/`, 334,7 sur `/resultats`, 300,5 sur `/connexion`, dont environ 68,5 Kio de polices non préchargées (Inter 600, Barlow 600 et 700). Ce que le retrait du préchargement garantit réellement : un premier rendu lisible non bloqué (`font-display: swap`, repli calibré, CLS 0,002) ; pas une réduction des octets. NFR-2 dit « premier chargement < 300 Ko » : à la lettre, il n'est pas tenu en octets transférés, et il ne l'était vraisemblablement pas avant la refonte non plus.
  evidence: rapport de la story 9.6 ; `scripts/check-budget.sh` lignes 1 à 25. Décision à prendre : soit redéfinir NFR-2 comme budget de chemin critique (et le dire dans la définition du script), soit réduire réellement les octets. Le sous-ensemble de caractères de Barlow, estimé à environ 23 Ko de gain réel sur les deux fichiers préchargés, est le levier honnête.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.6)
  summary: Zoom 200 % : toutes les pages publiques débordent horizontalement (227 px pour 195 px de largeur utile) à cause de `header-actions` (bascule de thème et lien admin, stories 1.6 et 3.3) et de l'onglet « Mon trail » (accueil, story 8.x). Défaut antérieur à l'épopée 9, à traiter globalement.
  evidence: harnais CDP, émulation 195 px ; `/resultats` est passé de 265 à 227 px grâce au correctif 9.5, le résidu est ce défaut commun.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.6)
  summary: Pied de page : quatre liens de 25,5 px de haut, et trois paires de liens séparées par 7,5 px au lieu de 8. Skip-link déployé au focus : 43,5 px. Tous antérieurs à l'épopée 9 (stories 2.4 et 1.1).
  evidence: harnais CDP à 390 px.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.6)
  summary: Sur `/resultats`, les titres d'épreuve (« La Longue — 35 km ») et la méta (« 35 km — départ à 08:00 ») débordent de 6 px à 195 px parce que leurs espaces sont insécables. Le corriger impose de toucher au formatage des textes, ce qui est un choix de contenu.
  evidence: résidu après correctif 9.5, harnais CDP.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.6)
  summary: Quatre écrans n'ont pas pu être mesurés à l'écran faute de base de données (`/inscription`, `/acceptations`, `/preuve`, `/espace-coureur` redirigent vers `/connexion`). Ils sont couverts par des tests qui lisent les feuilles de style (`socle.test.ts`, `dossier-css.test.ts`, `fil-etapes.test.tsx`, `contrastes.test.ts`), ce qui prouve les règles et non le rendu.
  evidence: `curl` : 307 vers `/connexion`. À mesurer en recette sur l'environnement déployé, ou avec la base de dev.
- source_spec: `_bmad-output/planning-artifacts/epics.md` (story 9.6)
  summary: `.aa-lien-texte` est utilisée sur six pages (accueil, section parcours, `/parcours`, `/region`, `/resultats`, `/retour-en-images`). Le correctif de cible tactile (`display: inline-flex; min-height: 44px`) s'applique donc aux six, pas seulement à l'accueil.
  evidence: `grep` des usages ; les tests de ces pages passent.
