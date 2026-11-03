# Story 10.4 — Non-régression des surfaces d'exploitation

Projet : `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/story-10-4-non-regression-exploitation`
(tip = commit `7cf5f7c`, story 10.3). Tu es le développeur, je suis l'architecte. Interdits :
aucune commande git en écriture, pas de modification de `_bmad-output/planning-artifacts/`,
`sprint-status.yaml`, `deferred-work.md`, aucune dépendance installée, aucun test existant
désactivé/supprimé/affaibli. Lis `epics.md` « Story 10.4 », puis les specs
`spec-10-1`, `spec-10-2`, `spec-10-3` et le modèle de rapport de `spec-9-6-non-regression-vitrine.md`.

Baseline : 187 fichiers de test, 2510 tests, typecheck vert, budget 279 Kio.
Story de **vérification**, pas de refonte : tu corriges seulement un vrai défaut que tu prouves.

## Règle d'honnêteté (la plus importante)

Pour CHAQUE garantie : **mesurée** (tu as exécuté, tu cites le chiffre) / **couverte par un test**
(tu cites son nom) / **non vérifiable ici** (tu dis pourquoi). Jamais « conforme » sans l'une des deux
premières. Contraintes du poste : les écrans `/volontaires*` et `/admin*` exigent une session et une
base ; aucun appareil ni simulateur n'est disponible. Ne simule pas ce que tu ne peux pas mesurer.
Un trou annoncé est utile, un trou caché est un défaut découvert au km 18.

## Partie A — Parcours hors-ligne (FR-8, FR-13, FR-14, NFR-1)

Inventorie les tests existants qui couvrent : retrait, scan de passage, file d'attente locale,
reprise de réseau, synchro par lots, confirmation < 1 s, repli iOS Safari (lecteur zxing).
Fais un tableau garantie → test(s) qui la couvrent → `couverte` / `trou`. Pour chaque trou
**atteignable par un test sans DOM ni réseau**, écris le test. Pour un trou qui exige un navigateur
réel ou un appareil, déclare-le non vérifiable. Ne touche à aucune logique de scan/sync/SW.

**Précache hors-ligne** : démontre par test ou par inspection du build réel (`pnpm build`, lire
les `<link>`/chunks CSS-JS de `/volontaires` et `/volontaires/scan` et la liste précachée par
`sw-volontaires.js`) qu'**aucun actif CSS/JS introduit par 10.1** n'échappe au service worker ;
ajoute un test de garde si l'invariant n'est pas déjà épinglé. Même contrôle pour
`dossiers.css` (10.3), s'il est servi hors du chunk partagé.

## Partie B — Accessibilité UX-DR-23 sur les écrans d'exploitation

Comme pour 9.6, par **lecture des feuilles CSS et du markup** (pas de rendu possible) :
focus visible ≥ 2 px, cibles ≥ 44 px (48 dp côté natif), écart ≥ 8 px, contrastes AA **y compris
mode sombre** (réutilise la logique de `contrastes.test.ts` ; ajoute les paires manquantes des
surfaces d'exploitation : voyants succès/doublon/inconnu, pastilles du socle, compteurs admin,
bandeau sync, états du suivi runners), icônes labellisées, décorations `aria-hidden`.
Les trois canaux du retour de scan — **visuel, sonore, vibration** — doivent rester distincts
**et testés** (UX-DR-6) : trouve les tests existants et cite-les ; écris ceux qui manquent
(mélodies distinctes succès/doublon/inconnu, vibrations distinctes, voyant distinct par forme).
Tout écart constaté non corrigé doit être listé avec fichier:ligne, **sans** le minimiser :
un ratio de 4,3:1 est un échec.

## Partie C — Recettes

Réaligne `scenarios-recette-epic-3.md`, `-4.md` et `-5.md` (dans
`_bmad-output/implementation-artifacts/`) sur les écrans refondus par 10.1 à 10.3 : corrige
chaque pas qui désigne un élément renommé ou déplacé, **sans jamais supprimer un pas** ; ajoute
les pas pour ce qui est neuf et visible (bandeau « ◷ N passages en attente », pastilles de statut,
compteurs de `/admin/dossiers`, état du suivi en tête côté app, pastille « Se déconnecter »,
fiche mission en titre principal). Écris pour un testeur humain sans connaissance du code, au
format tableau `#` / `Action` / `Résultat attendu` des pas existants. Ne change ni le périmètre ni
la date d'en-tête des modules non touchés. N'invente aucune donnée ni fonction : décris ce qui
existe (ex. compteurs non cliquables, calculés sur ≤ 200 dossiers).

## Contraintes

`pnpm typecheck` (3 paquets), `pnpm test`, `pnpm budget` ≤ 300 Kio verts. Pas de chinois.
Pas de commit. Si tu lances un serveur de build/prod, tue-le à la fin (`lsof -ti :<port>`).

## Livrables

Rapport final : tableau garantie × statut (mesurée / test / non vérifiable), liste des tests
ajoutés, défauts trouvés (corrigés ou consignés), fichiers modifiés, nombres de tests.
