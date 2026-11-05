# Corrections issues de la revue de l'épopée 10

Projet `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `fix/revue-epopee-10` (tip `a860424`).
Tu es développeur, je suis l'architecte/PO. Lis `_bmad-output/implementation-artifacts/revue-epopee-10.md`
(ta revue, que j'ai triée ; j'ai amendé les AC de l'épopée 10 dans `epics.md`). **Pas de point de
contrôle bmad** : modifications directes, puis rapport. Interdits : aucune commande git en écriture, pas
de modification de `_bmad-output/planning-artifacts/`, `sprint-status.yaml`, `deferred-work.md`, aucune
dépendance, aucun test existant affaibli (un test qui épinglait un défaut peut être réaligné, justifié).
Postgres de dev reste allumé. Tu es seul sur le dépôt : tu peux lancer `pnpm test` et `pnpm budget`.

## Bloquant — à corriger en premier

- **B1** : `libelleEtatSuivi` (`apps/runners/src/ecrans/suivi.tsx`) ne doit JAMAIS affirmer « Suivi activé »
  quand le moteur n'a pas démarré. Rends le `switch` exhaustif (plus de `default` qui absorbe),
  ajoute un cas pour `optIn: true, etatMoteur: 'inactif'` avec un libellé honnête en toutes lettres
  (ex. « Suivi demandé, pas démarré ») **et** un corps de texte qui n'affirme pas « Ta position est
  partagée toutes les 7 minutes » dans cet état (dis ce qui est vrai : le suivi n'a pas pu démarrer,
  vérifie les services de localisation). Tests sur `(true,'inactif')` et sur l'exhaustivité (chaque valeur
  de `EtatSuivi` a un libellé distinct). Vérifie aussi `App.tsx` : aucun autre écran n'affirme un suivi actif
  dans cet état.

## Important

- **I2** : distingue réellement `destructeur` de `principal` **par la forme** (`ui.tsx`) : le destructeur
  n'est plus une pastille pleine ; fais-le en contour épais (3 px) de la couleur danger + pictogramme
  textuel `⚠` marqué `aria-hidden` devant le libellé, texte danger sur fond transparent. Contrastes AA
  testés dans les deux thèmes (étends `contrastes-theme.test.ts` avec la paire danger sur fond, l'état
  pressé à 80 % compris). Corrige le commentaire faux.
- **I10** : « Se déconnecter » demande une **confirmation native** (`Alert.alert`, titre « Supprimer ton
  e-dossard de ce téléphone ? », corps qui dit ce qui est perdu : e-dossard hors-ligne et positions en
  attente, boutons « Annuler » / « Me déconnecter »). La logique de décision/libellés dans une
  fonction pure testable ; `App.tsx` appelle l'Alert. Ne change pas l'effet de la déconnexion.
- **I8** : étends `edossard-garanties.test.ts` pour lire aussi `dossier.tsx` et épingler que
  `variante="destructeur"` apparaît **exactement une fois** par écran concerné (`toHaveLength(1)`),
  et que `contour`/`principal` ne l'ont pas. Démontre que rétrograder `dossier.tsx` fait échouer le test.
- **I7** : la garde « émission immédiate » du mode passage dans `volontaires/scan/page.test.tsx`
  tranche depuis `indexOf(mode)` et valide toujours le bloc retrait. Scinde en gardes qui ciblent
  chaque site d'appel (`traiterScanPassage(` / `traiterScanRetrait(` à l'usage, pas à l'import) ;
  démontre par mutation (inverse l'ordre dans une copie temporaire, ne modifie pas le code produit)
  que la garde du passage échoue quand il le faut, puis restaure.
- **I9** : `admin/dossiers/[id]/page.tsx` : bascule sur `PASTILLE_STATUT` + `.socle-pastille`
  (comme la liste), retire `coureurStatusChipClass` et `.aa-chip` devenus morts **si** plus aucun
  consommateur (vérifie par grep, y compris `inscriptions.test.ts:607-610` : réaligne ce test s'il épinglait
  la fonction supprimée, en justifiant). Test de rendu de la pastille.
- **I6** : corrige les trois cibles < 44 px : `.course-ligne-annuler` (`course.css`, bouton d'annulation
  d'un passage, ≥ 44 px de haut, jamais collé au bord), `.admin-nav__lien` (`admin.css`), `.btn-lien`
  (`globals.css`, même approche que `.aa-lien-texte` : `display:inline-flex; align-items:center;
  min-height:44px`) ; vérifie que `.btn-lien` n'est utilisé que dans des contextes où ce changement ne casse
  pas la mise en page (liste les 30 usages par fichier, signale tout risque). Tests de lecture CSS
  (`min-height` ≥ 44) pour chacun.

## Mineurs

- **M1** le compteur « Acceptations manquantes » exclut les dossiers `refusé` (test mis à jour). **M2**
  importe `LIST_COUREURS_LIMIT` dans les messages de `/admin/dossiers` (plus de « 200 » en dur) et dans le
  test. **M3** `contrastes-exploitation.test.ts` : lis `#FFD9D6`, `#5D6058`, `#0C1610` dans les feuilles/tokens
  (scopés à `.scan-voyant-action`, `.scan-ecran`, `siteTokens.themes.light['ink-muted']`), échoue plutôt que
  de replier sur une valeur par défaut. **M4** la garde « seule animation » de `course.css` compte
  `animation:` sur toute la feuille hors `@keyframes`. **M5** supprime l'assertion redondante « numéro 74 px
  ≥ 3:1 » ou fais-la porter sur une paire distincte. **M7** étends `apps/runners/src/source-sans-litteraux.test.ts`
  aux notations fonctionnelles (`rgb(`, `rgba(`, `hsl(`) entre guillemets, mêmes exceptions justifiées.
  **M8** dans le media query de `volontaires.css` : `table.volontaires-table td.socle-num { text-align:left;
  white-space:normal }`. **M9** corrige l'intitulé de `suivi-etat.test.ts` (l'intention réelle : état avant
  journal). **M10** `theme.test.ts` : paramètre le mock sur ios ET android. **M12** un test de rendu SSR par
  manager (`contenus`, `sponsors`, `retour-images`, `missions`) sur le gabarit `volontaires-manager.test.tsx`
  qui épingle l'adoption de `socle-chip`/`socle-pastille` (démontre par mutation qu'il échoue sans la classe).
- **Ne fais pas** M6 (utilitaire WCAG partagé) ni M11 (migration du vocabulaire de rayons) : je les consigne.

## Rédaction demandée (M13)

Écris `_bmad-output/implementation-artifacts/scenarios-recette-epic-10.md` (règle `AGENTS.md`, gabarit
`scenarios-recette-epic-1.md` ; recettes 3/4/5/6 déjà réalignées : renvoie-y) : prérequis d'environnement en
tête, **un module par story 10.1 à 10.4** (préconditions, étapes `#`/`Action`/`Résultat attendu` concrètes
pour un testeur humain sans connaissance du code, cases à cocher), tableau de synthèse. Décris ce qui existe
vraiment : compteurs non cliquables sur ≤ 200 dossiers, fraîcheur du tableau live en en-tête, suivi demandé mais
non démarré, confirmation de déconnexion, pastilles de statut, et liste explicitement ce qu'un testeur doit
juger **à l'œil** (rayons, ombres, pilules, rendu natif) puisque rien de visuel n'a été vérifié.

## Exigences

`pnpm typecheck` (3 paquets), `pnpm test`, `pnpm budget` ≤ 300 Kio verts, nombres avant/après. Pas de chinois.
Pas de commit. Rapport final honnête : pour chaque point, *corrigé + test (nom)* / *non fait (pourquoi)*.
