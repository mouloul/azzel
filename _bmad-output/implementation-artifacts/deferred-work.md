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

- ~~Ni correction ni suppression d'un volontaire côté admin : un email mal saisi à l'import crée un compte fantôme permanent (invitation en file, liste admin) et bloque même un futur coureur sur cette adresse (« compte volontaire »). Fonctionnalité hors périmètre 3.1 (CRUD volontaire) — `apps/web/src/modules/missions/store.ts`.~~ **Résolu (2026-11-07)** par la story 3.5 — `spec-3-5-correction-et-suppression-d-un-volontaire.md` : `PUT`/`DELETE /api/admin/volontaires/{id}`, correction d'adresse avec renvoi d'invitation, suppression du compte libérant l'adresse (refus chiffré si le volontaire tient encore des missions).

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

## Deferred from: build de la story 10.1 — PWA volontaires refondue (2026-11-03)

- **Rendu non comparé visuellement** : les deltas (cartes 16 px + ombre, CTA pilules, chips) sont jugés sur le code, pas sur capture. Recette humaine requise sur appareil.
- **Prémisse UX-DR-7 de la story fausse** : le voyant était déjà conforme ; le critère de la story était périmé. Consigné dans la spec 10.1.
- **`.volontaires-badge` hors socle** : pilule pleine « HORS-LIGNE PRÊT » ; `.socle-pastille` est point + libellé. Arbitrer si le socle doit offrir une variante pleine.
- **`LogoutButton` / `AssistanceButton` (`.btn-contour`)** restent sur l'ancienne classe globale, partagée par 8+ surfaces : à migrer dans 10.3 ou une story transverse.
- **Pas de `bmad-code-review`** sur cette story.

## Deferred from: build de la story 10.2 — app coureurs refondue (2026-11-03)

- **Rendu natif jamais vérifié** (contrastes plein soleil, Switch, QR, états pressed) : recette sur appareil requise.
- **Mode sombre par défaut** : critère de la story non appliqué, contredit UX-DR-2 (suit le système). Décision produit à prendre.
- **« Se déconnecter » en pleine pastille danger** : choix de design à valider ; une déconnexion est-elle assez destructrice pour dominer l'écran ? Alternative : contour + icône.
- **Distinction destructeur/principal par la couleur seule** sur l'écran dossier faute d'icônes.
- **Progression et position sur le tracé** : absentes de l'état de l'app ; à spécifier si voulues (dépend de l'épopée 11).
- **Pas de `bmad-code-review`** sur cette story.

## Deferred from: build de la story 10.3 — back-office refondu (2026-11-03)

- **Rendu admin jamais vu** : aucune base ni session en dev ; recette humaine (`dev-db.sh` + session organisateur) requise.
- **Compteurs sur ≤ 200 dossiers** : ne reflètent pas l'édition entière au-delà. Un vrai « à valider » (preuve déposée, non traitée) et des liens de filtre exigent une requête d'agrégat et un filtre de statut : à spécifier.
- **Chips sans base** : `.chip-statut` était définie dans une feuille non chargée par `/admin/missions` — signe que le CSS par route masque des dépendances ; couvert pour ces cas par le socle.
- **Fraîcheur en en-tête** et non en pied (critère 5.1 historique).
- **Artboard `AdminDossiers`** absent du dépôt.
- **Pas de `bmad-code-review`** sur cette story.

## Deferred from: build de la story 10.4 — non-régression des surfaces d'exploitation (2026-11-03)

- **Cibles sous 44 px, antérieures à l'épopée 10, non corrigées** : `.btn-lien` ≈ 41,5 px (`globals.css:489`, « Revenir à ma fiche », « Reconnecte-toi ») ; `.admin-nav__lien` ≈ 43,2 px (`admin.css:18`) ; `.course-ligne-annuler` ≈ 21 px (`course.css:71`, annulation d'un passage, story 5.4). Ce dernier est le plus grave : action d'annulation du PC à 21 px.
- **Non vérifiable sans appareil** : latence réelle de confirmation < 1 s sur iPhone (couverte seulement par la structure du code), rendu natif, hors-ligne de bout en bout dans un navigateur réel. Le câblage de reprise réseau est couvert par lecture de source, pas par comportement (vitest sans DOM).
- **Recette de l'épopée 5 inchangée** : aucun pas ne désignait d'élément modifié ; recette 6 étendue (2 pas) car les écrans de l'app coureurs en dépendent.
- **Ce que GLM a touché en base de dev** : sessions de sonde créées puis supprimées pour mesurer le précache sur build réel ; à confirmer que la base de dev est propre.
- **Pas de `bmad-code-review`** sur 10.1 à 10.4.

## Deferred from: build de la story 11.1 — pipeline GPX vers parcours.json (2026-11-03)

- **Chiffres publiés issus d'un relevé d'ESSAI** : le GPX source est « essai trail ait ainsi 2027 » (28,0 km, D+ 1 186 m) ; l'accueil affiche désormais ce D+ pour la longue alors que la distance affichée vient de la base (la page parcours annonce ~35 km). Risque de contradiction visible. À trancher : relevé officiel, ou retrait de la fusion (suppression de `parcours.json` ⇒ retour à `null`, sans autre changement).
- **Manques côté organisation (rien inventé)** : tracé GPX de l'épreuve moyenne ; ravitaillements et services réels (seuls Départ et Arrivée existent) ; heure de départ et barrière horaire (toujours `null`).
- **Seuil D+ 5 m** : brut 1 280 m → 1 186 m (−7,3 %), constante arbitraire à valider avec l'organisation ; D+ calculé sur altitudes non arrondies (arrondir à 0,1 m le ferait passer à 1 176 m).
- **Porte de qualité** : constantes (pas médian ≤ 2 s, ≤ 5 % de la distance en segments > 30 s, ≤ 1 % de points > 12,5 m/s) calibrées sur DEUX relevés seulement ; elles refusent le second sur trois défauts à la fois.
- **Postgres de dev** arrêté par la session GLM ; relancé par l'architecte (`scripts/dev-db.sh up`). Les tests d'intégration échouent base arrêtée (25 fichiers) : piège pour toute session suivante.
- **Pas de `bmad-code-review`** sur cette story.
- source_spec: `_bmad-output/implementation-artifacts/spec-11-4-profil-altimetrique-et-graphe-de-technicite.md`
  summary: Épingler par test le CustomEvent `az-parcours-curseur` (detail `{epreuve, sM}`) et les interactions réelles du curseur (pointeur, flèches, aria-live) — aucun harnais DOM (jsdom/testing-library) dans le repo, tests actuels node/SSR-only.
  evidence: Recherche vérification-gap (story 11.4) : supprimer le dispatch du useEffect ou casser un handler ne fait échouer AUCUN test ; à rouvrir à la 11.5 (premier consommateur du bus `s`) en décidant alors du harnais DOM.

## Deferred from: build de la story 11.4 — profil altimétrique (2026-11-04, architecte)

- **Contradiction de distance dans la base** : la longue est « 35 km » dans `inscriptions/migrations/0002_inscriptions.sql:70` (`'La Longue — 35 km', 35.0`, affiché par `app/parcours/page.tsx:59`) et `contenus/migrations/0014_contenus_vitrine.sql:55` (`'Trail long — 35 km'`), alors que la section d'accueil affiche désormais 28 km (relevé d'essai, décision du 2026-11-04). La page `/parcours` et l'accueil peuvent se contredire. À aligner quand le tracé officiel existe (migration éditoriale).
- **Mention « tracé provisoire »** : constante `MENTION_TRACE_PROVISOIRE` (`components/section-parcours.tsx`) ; à retirer en une ligne quand le tracé sera officiel.
- **Profil limité à la longue** : la moyenne n'a aucune donnée, donc aucune visualisation.
- **Interactions du curseur non testées à l'exécution** (pointeur, clavier, événement) faute de harnais DOM ; garanties par des fonctions pures et le rendu SSR. À rouvrir en 11.5.
- **Poids** : HTML de l'accueil 43 → 77 Ko bruts (8 → 16 Ko gzip) ; budget 288/300 Kio, marge 11,9 Kio, à surveiller pour les stories 11.3 et 11.5.
- **Rendu réel non vérifié** (couleurs perçues, tap, annonce vocale) : recette humaine.
- **Pas de `bmad-code-review` humain/architecte** ; GLM a fait une auto-revue en 3 couches (journal dans la spec).

## Deferred from: revues indépendantes des épopées 9 et 10 (2026-11-04)

Rapports : `revue-epopee-9.md`, `revue-epopee-10.md` (aucun bloquant sur l'épopée 9 ; un bloquant sur l'épopée 10, « Suivi activé » affiché moteur non démarré, corrigé et testé). Corrigés sur `fix/revue-epopee-9` et `fix/revue-epopee-10`. Restent :

- ~~**NFR-2 en octets transférés**~~ — **tranché le 2026-11-04**, voir l'amendement dans `epics.md`. Mesure honnête par Chrome : 344 776 o (336,7 Kio) sur `/`, dont 181,4 Kio de socle incompressible. NFR-2 porte maintenant deux seuils bloquants en CI (poids réel ≤ 350 Kio, chemin critique ≤ 300 Kio) ; les polices servies sont élaguées sans perdre un caractère. État : 326 Kio réels, 283 Kio critiques. Reste ouvert, sans échéance : les 145 Ko de runtime d'App Router, seul vrai poste de réduction restant, et le fait que `/resultats` (334,7 Kio avant élagage) n'est pas mesuré par le budget.
- **Rayons hérités à 6 px** (`.aa-btn`, `.carte-course`, `vitrine-textes.css`) et vocabulaire mixte `--az-radius-full` / `--az-rayon-*` dans `volontaires.css` : story de finition de la vitrine.
- **Utilitaire WCAG dupliqué** dans 4 fichiers de test (`contrastes*.test.ts`, `socle.test.ts`, runners) : à extraire.
- **`.btn-lien` global passé à `min-height: 44px` (37 usages, 19 fichiers)** : le rendu n'a été vérifié que par lecture CSS ; relire à l'œil les écrans qui l'utilisent (missions, scan, volontaires, sponsors, retour-images, dossiers, course, preuve).
- **Destructeur de l'app coureurs** : pastille pleine à l'état pressé (inversion) au lieu de l'opacité 80 % (sous AA, 4,18–4,48:1). Rendu natif jamais vu.
- **Aucune vérification visuelle réelle** des épopées 9 et 10 : recettes `scenarios-recette-epic-9.md` et `-10.md` listent ce qu'un humain doit juger à l'œil.

## Deferred from: code review des stories 3.3 et 4.1–4.5, groupe 1 — client terrain (2026-11-07)

Revue à 4 couches (Blind Hunter, Edge Case Hunter, Verification Gap, Acceptance Auditor) sur `public/sw-volontaires.js`, `app/volontaires/*` et `app/espace-coureur/e-dossard/page.tsx`. Le groupe 2 (chrono serveur, API volontaires, contrats `packages/shared`) n'a PAS encore été relu.

- **Le scanner ne lie pas la poche au compte** [`app/volontaires/scan/scan-client.tsx:263,274-278`] — `volontaires-pwa.tsx` applique la décision D1 (purge de la poche AVANT toute lecture, `lierPocheAuCompte`), `ScanClient` ne l'applique pas : ouvert directement (raccourci écran d'accueil, entrée de cache SW) après un changement de compte sur le même appareil, il lit l'annuaire du compte précédent. Différé : l'annuaire est peut-être scopé à l'ÉDITION et non au compte, auquel cas les deux surfaces se contredisent et c'est la fiche qui a tort. À trancher avant de patcher.
- **Aucun harnais DOM : trois câblages ne tiennent que par des tests qui lisent le source** — (a) l'ordonnancement `assurerLiaison()` avant `lireAnnuaire()`/`lireEtatVolontaires()` [`volontaires-pwa.tsx:245,271,314,347`] ; (b) le ternaire `restant > 0 ? 'attente' : 'envoye'` [`bandeau-sync.tsx:188,205`] ; (c) l'aiguillage `mode === 'retrait'` du scanner [`scan-client.tsx:277,284,312`]. Inverser l'un des trois laisse la suite verte. Même décision d'outillage que BF3/BF4 (3.4) et BF5/VG4 (3.3). Remède bon marché dans le style maison : extraire ces décisions en helpers purs de `lib/` et les tester directement.
- **Sous-ressources de la charte non précachées** [`sw-volontaires.js:108-122`] — `extraireSousResources()` ne lit que les `<script src>` et `<link href>` du HTML ; les polices et images appelées en `url()` depuis la feuille `/charte/` échappent au précache, alors que le commentaire promet « la PREMIÈRE visite doit suffire à être stylée hors-ligne ».
- **Installation du service worker en tout-ou-rien** [`sw-volontaires.js:149-158`] — `precacherShell()` peut rejeter (503 passager, première arrivée directement sur `/volontaires/scan`, démarrage sans réseau) : rien n'est alors mis en cache, ni shell ni statiques ni icônes, jusqu'à un prochain chargement réussi. Les sous-ressources sont tolérantes (`Promise.allSettled`), le shell non.
- **Cache shell sans plafond ni purge** [`sw-volontaires.js:200,211`] — clé `pathname + search` : chaque paramètre inventé crée une entrée, aucune politique de taille ou d'âge. Risque d'éviction par quota de la fiche elle-même. Différé : le correctif (liste blanche de paramètres ou plafond d'entrées) ajoute de la complexité pour un cas qu'un volontaire ne rencontre pas seul.
- **`generéA` : identifiant accentué dans un format persisté** [`app/volontaires/page.tsx`, `lib/idb-volontaires.ts`, `lib/revalidation-etat.ts`, `lib/fraicheur.ts`, `api/volontaires/etat/route.ts`] — la clé porte un accent alors que l'annuaire utilise `genereA` sans accent ; elle voyage en JSON sur le réseau, est mise en cache par le service worker et stockée en IndexedDB. Différé : le renommage n'est PAS cosmétique — il faut une lecture tolérante aux deux clés pendant une version et un incrément de `VERSION` du SW pour purger les caches, sinon le badge de fraîcheur casse sur tout appareil déjà installé. 10 fichiers sources concernés.
- **La fiche importe le module de route du scanner** [`app/volontaires/page.tsx:12`] — `import { NOTICE_SCAN_PASSAGE, NOTICE_SCAN_RETRAIT } from './scan/page'` : la fiche tire tout le graphe du module page du scanner (`redirect`, `requireRolePage`, `getMissionsVolontaireState`, `./scan.css`, `export const dynamic`, `metadata`). Ces constantes devraient vivre dans un module neutre (`lib/scan/notices.ts`) importé par les deux pages. Sans effet mesuré aujourd'hui, à reprendre avec une passe sur le découpage des chunks.
- **Marqueur de shell dupliqué sans garde-fou** [`sw-volontaires.js:43` et `volontaires-pwa.tsx`] — le SW code en dur `data-az-shell="fiche"`, React l'exporte de son côté ; le SW n'étant pas bundlé, rien ne relie les deux. Un renommage côté React désactive silencieusement TOUT le cache hors-ligne. Il manque un test qui rende le composant et vérifie que le HTML contient la chaîne attendue par le SW.

- source_spec: `_bmad-output/implementation-artifacts/spec-inscriptions-wilaya-hebergement.md`
  summary: Tester le câblage client du choix de wilaya (décochage de l'hébergement) dans un environnement DOM.
  evidence: Aucun outillage d'interaction (jsdom/testing-library absents) ; seuls `choisirWilaya` et le rendu SSR sont testés, la recette I9 (9.7, 9.16) couvre à la main.
- source_spec: `_bmad-output/implementation-artifacts/spec-inscriptions-wilaya-hebergement.md`
  summary: Afficher la provenance (wilaya / pays) dans la liste admin des inscriptions et dans les exports CSV.
  evidence: Seule la fiche détail l'affiche ; repérer les dossiers anciens de Tizi Ouzou avec hébergement exige psql, inaccessible à un organisateur en production.
- source_spec: `_bmad-output/implementation-artifacts/spec-inscriptions-wilaya-hebergement.md`
  summary: Annoncer la restriction « hébergement hors Tizi Ouzou » sur les pages publiques (contenu « hébergement » de /region, règlement).
  evidence: Le contenu `hebergement` (contenus/domain.ts) est éditable en admin ; un participant de Tizi Ouzou ne découvre la règle qu'au formulaire.
- source_spec: `_bmad-output/implementation-artifacts/spec-inscriptions-wilaya-hebergement.md`
  summary: Décider du sort des dossiers déjà validés avec hébergement et sans wilaya (éventuellement de Tizi Ouzou).
  evidence: Un dossier validé n'est plus modifiable : il garde son lit indéfiniment ; décision PO requise (tri manuel ou outil admin).
- source_spec: `_bmad-output/implementation-artifacts/spec-dossier-refuse-modifiable.md`
  summary: Empêcher l'organisateur de valider une preuve remplacée après l'ouverture de la fiche (contrôle de concurrence sur l'identifiant de preuve).
  evidence: `decideDossier` ne reçoit pas la preuve examinée ; le remplacement reste permis en validation.
- source_spec: `_bmad-output/implementation-artifacts/spec-dossier-refuse-modifiable.md`
  summary: Garder l'historique des refus (date, auteur, motif) visible côté admin après la reprise d'un dossier.
  evidence: La reprise efface `refusal_reason` ; seule une preuve au statut « refusée » en garde trace.
- source_spec: `_bmad-output/implementation-artifacts/spec-dossier-refuse-modifiable.md`
  summary: Décider si un dossier refusé ou expiré peut être repris après la clôture des inscriptions, et adapter emails et pages en conséquence.
  evidence: `submitInscription` lève `RegistrationClosedError` ; les emails de refus/expiration renvoient pourtant vers « Modifier mon inscription ».
- source_spec: `_bmad-output/implementation-artifacts/spec-dossier-refuse-modifiable.md`
  summary: Aligner l'ordre des verrous (édition puis coureur) dans `decideDossier` pour éviter un interblocage avec `upsertCoureur`.
  evidence: `decideDossier` verrouille le coureur puis l'édition (dossard) ; `upsertCoureur` fait l'inverse.
- source_spec: `_bmad-output/implementation-artifacts/spec-validation-figee.md`
  summary: Résolu — « Empêcher l'organisateur de valider une preuve remplacée après l'ouverture de la fiche » (entrée de `spec-dossier-refuse-modifiable.md`) n'a plus d'objet.
  evidence: Décision PO du 11/11/2026 : aucun dépôt de preuve en validation (`canDepositPreuve` réservé à « en constitution », 409 `inscriptions.dossier_en_validation`). La preuve examinée ne peut plus changer pendant l'examen.

- source_spec: `_bmad-output/implementation-artifacts/spec-validation-figee.md`
  summary: Permettre au coureur de voir (aperçu ou téléchargement) la preuve qu'il a déposée, sur /preuve en lecture seule.
  evidence: La vue en validation demande « Tu t'es trompé de fichier ? » sans montrer le fichier ; aucune route de téléchargement côté coureur.

- source_spec: `_bmad-output/implementation-artifacts/spec-carte-surcouche-noms-chemins-osm.md`
  summary: Ajouter un test qui valide le style MapLibre complet (initial + surcouche ajoutée) avec `validateStyleMin` de `@maplibre/maplibre-gl-style-spec`.
  evidence: Une faute d'expression dans une couche passerait les tests actuels mais ferait rejeter le style par MapLibre ; le paquet n'est pas résoluble depuis `apps/web` (dépendance transitive pnpm), il faut l'ajouter en devDependency.
- source_spec: `_bmad-output/implementation-artifacts/spec-carte-surcouche-noms-chemins-osm.md`
  summary: Rendre les attributions cartographiques avec liens (openstreetmap.org/copyright, opentopomap.org, openmaptiles.org, openfreemap.org) dans `vue-parcours.tsx`.
  evidence: Le bloc rend des chaînes en texte brut alors que `CREDITS.md` liste des « liens à conserver » et que les règles d'attribution OSMF demandent un lien sur carte interactive ; motif préexistant (OpenTopoMap).

- source_spec: `_bmad-output/implementation-artifacts/spec-delai-preuve-heures.md`
  summary: Déployer la migration 0045 et le code ensemble (ou scinder en deux migrations : ajout de `delai_preuve_heures`, puis suppression de `delai_preuve_jours` après déploiement).
  evidence: Entre la migration et le déploiement, l'ancien code lit une colonne supprimée (ou le nouveau une colonne absente) : inscriptions et admin en 500. La suppression est gelée dans la spec ; fenêtre courte en recette (migration lancée à la main depuis un poste).
