# Story 10.2 — App coureurs refondue

Projet : `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/story-10-2-app-coureurs`
(tip = commit `a0d6d97`, story 10.1). Tu es le développeur, je suis l'architecte. Interdits :
aucune commande git en écriture, pas de modification de `_bmad-output/planning-artifacts/`,
`sprint-status.yaml`, `deferred-work.md`, aucune dépendance installée, aucun test existant
désactivé/supprimé/affaibli. Lis d'abord `epics.md` « Story 10.2 » et les artboards
`CoureurEdossard`, `CoureurSuivi` de `maquettes-refonte-design-2026-11-02.md`.

Baseline : 183 fichiers de test, 2480 tests, typecheck vert. Vitest n'a PAS de DOM ni de
react-native : les tests de l'app runners sont des tests de logique/lecture de source
(`theme.test.ts`, etc.). N'ajoute pas de dépendance de test.

## Constat mesuré de l'architecte — à vérifier, pas à croire

Plusieurs prémisses de la story sont déjà vraies ou fausses dans le code :

1. **« Le thème lit les tokens sans valeur littérale résiduelle »** : `src/theme.ts` lit déjà
   `tokens.colors` via des paires clair/sombre. Les seuls littéraux hex de `apps/runners` (hors
   tests) sont dans `src/ecrans/edossard.tsx` l.19-27 : `#101A14` (= `bg-sombre`), `#E8F0E9`
   (= `texte-sombre`), `#A9C0AE` (= `texte-2-sombre`), `#8FD4A8` (= `action-sombre` /
   `vert-altitude`), `#0C2415` (= `action-texte-sombre`), `#16281C` (= `texte`), `#FFFFFF`
   (blanc du QR, à garder en littéral documenté : exigence de lisibilité QR). **Tu remplaces
   ces littéraux par les tokens de `@azzel/shared`** (en gardant le rendu strictement identique)
   et tu ajoutes un test qui interdit tout littéral hex dans `apps/runners/src` hors
   exceptions listées (QR blanc), au modèle de `css-sans-litteraux.test.ts` côté web.
2. **« Mode sombre par défaut »** : NE change PAS le comportement du thème (suit le système,
   UX-DR-2 ; l'écran e-dossard est déjà toujours sombre). Dis simplement ce que tu constates ;
   la décision de forcer le sombre partout n'est pas à prendre ici.
3. **E-dossard** : vérifie numéro 74 px, « HORS-LIGNE PRÊT » en monospace, QR sur carte
   blanche à coins arrondis — documente ce qui est conforme (fichier:ligne) et verrouille par
   test de lecture de source ce qui ne l'est pas déjà. Ne touche ni au cache (offline-cache), ni à la
   génération du QR.
4. **Suivi** (`suivi.tsx`) : l'état du suivi (activé / désactivé / en pause / interrompu) doit
   être lisible **en haut d'écran**. Audite l'ordre actuel ; si l'état n'est pas en tête,
   remonte-le (déplacement minimal, aucun texte supprimé, toutes les garanties 6.2/6.3/6.4 et
   « Désactivé : rien n'est enregistré » intactes). Hiérarchie : progression / état, position,
   puis journal de synchro. **N'invente aucune donnée de progression ni de position qui
   n'existe pas dans l'état de l'app** : si la « progression sur le tracé » n'existe pas,
   dis-le, ne l'affiche pas.
5. **Actions destructrices distinctes par la forme** : inventorie les actions destructrices ou
   irréversibles réellement présentes dans l'app (arrêt du suivi, déconnexion…). « Abandon »
   n'existe probablement pas côté app coureurs (saisi au PC) : vérifie et dis-le. Pour celles
   qui existent, distingue-les des actions courantes par la forme (ex. contour + icône/libellé
   explicite, pas seulement la couleur) en réutilisant `Bouton` de `ui.tsx` (variante).
6. **Cibles** : ≥ 44 dp partout (les 48 existants conviennent). Les « contrôles de pause et
   d'arrêt du scan ≥ 64 dp » concernent le scan, qui est dans la PWA volontaires (10.1, déjà
   conforme), pas dans l'app coureurs : dis-le, ne crée rien.
7. **Reduced motion** : l'app a-t-elle des animations ? Si non, dis-le ; si oui, rends-les
   statiques via `AccessibilityInfo.isReduceMotionEnabled`.

## Contraintes dures

- Aucune logique métier modifiée (tracking, outbox, auth, orchestration). Tests existants
  verts, intention inchangée.
- Rendu identique hors changements voulus ci-dessus ; liste tout écart.
- `pnpm typecheck` (3 paquets) et `pnpm test` verts ; `pnpm budget` ≤ 300 Kio.
- Pas de chinois. Pas de commit.

## Livrables

Rapport final honnête : pour chaque critère d'acceptation, *mesuré* / *couvert par test (nom)* /
*non vérifiable ici (pourquoi)*. Précise explicitement que le rendu natif n'a pas pu être
vérifié sur appareil ou simulateur (aucun n'est disponible) si c'est le cas. Liste fichiers
modifiés, nombres de tests.
