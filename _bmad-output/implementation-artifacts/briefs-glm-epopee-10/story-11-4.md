# Story 11.4 — Profil altimétrique et graphe de technicité

Projet `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/story-11-4-profil-altimetrique`
(tip = commit `88944cc`, story 11.1). Tu es le développeur, je suis l'architecte/PO.
**Ne t'arrête à aucun point de contrôle** : si tu suis le workflow `bmad-build`, ta spec est
**approuvée d'avance** ; écris-la brièvement (statut `review` en fin) puis implémente toute la
story dans cette session, sans attendre de réponse. Interdits : aucune commande git en écriture,
pas de modification de `_bmad-output/planning-artifacts/`, `sprint-status.yaml`,
`deferred-work.md`, aucune dépendance installée (SVG à la main, pas de lib de graphes), aucun
test existant désactivé/supprimé/affaibli. Lis `epics.md` « Story 11.4 » (FR-30, UX-DR-27, UX-DR-36),
`apps/web/src/modules/contenus/parcours/` (lecture, `ParcoursDoc`, `parcours.json`),
`section-parcours.ts` et `components/section-parcours.tsx` (emplacement annoncé de la visualisation).

**Prérequis : Postgres de dev doit tourner pour `pnpm test`** (`bash scripts/dev-db.sh up`, déjà
lancé ; si 25 fichiers d'intégration échouent, c'est la base). **Ne l'arrête pas à la fin.**
Baseline : 196 fichiers, 2594 tests (+5 skipped), typecheck vert, `pnpm budget` 279 Kio.

## Données et contraintes de vérité

- Source : `profile[[dist_m, alt]]` (3 222 points) et points de passage de `parcours.json`, par
  épreuve (`s` par épreuve). Seule la **longue** existe ; Départ et Arrivée sont ses seuls
  points de passage. La **moyenne n'a pas de données : aucun profil, aucun chiffre** (le rendu doit
  continuer d'afficher l'annonce texte pour elle).
- Ne mets **pas** les 3 222 points tels quels dans le HTML de l'accueil. Décime pour l'affichage
  (algorithme documenté, tolérance d'altitude chiffrée, p. ex. Douglas-Peucker ou pas fixe) et
  **mesure** l'effet sur `pnpm budget` et sur l'HTML de `/` (bruts et gzip). Le seuil 300 Kio reste
  la contrainte ; dis la marge.
- **Pente** : calculée sur une fenêtre de distance (p. ex. 50–100 m, constante nommée et
  documentée) pour ne pas colorer le bruit du GPS. **Échelle verrouillée** (UX-DR-36), constantes
  nommées + test des bornes : < 5 % roulant · 5–12 % soutenu · 12–20 % raide · > 20 % très raide.
  Pente en valeur absolue ou signée ? Choisis, documente : la légende doit dire de quoi il s'agit
  (montée / descente) pour ne pas induire en erreur.
- **Couleurs** : les quatre teintes **diffèrent aussi en clarté** (lisible en niveaux de gris et
  pour un daltonien) ; légende en **trait + toutes lettres** (jamais la couleur seule). Utilise les
  tokens (`packages/shared`, `var(--az-*)`) ; tu peux ajouter des tokens de pente (avec leurs
  variantes sombres si la parité clair/sombre l'exige ; `tokens:sync` régénère le CSS, ne l'édite
  jamais à la main ; `tokens.test.ts` doit continuer de passer — adapte-le seulement si tu ajoutes
  des clés, en le disant). Contrastes AA dans les deux thèmes, testés (modèle `contrastes.test.ts`).
  Aucun littéral hex dans les CSS écrits à la main (ratchet `css-sans-litteraux.test.ts`).

## À construire

1. **Profil SVG** lisible d'abord sur téléphone (390 px, sans défilement horizontal de la page),
   aire sous la courbe colorée **par palier de pente**, axes lisibles (km, altitude), points de
   passage repérés (Départ/Arrivée) avec bornes de segment donnant kilomètre et D+.
2. **Lecture au survol ET au tap**, aucune information ne dépend du survol (UX-DR-27) : un curseur
   dans le profil, au pointeur et au clavier (flèches, focusable, `role` adapté), affichant
   kilomètre, altitude, pente + palier en toutes lettres. **Valeurs annoncées en texte
   accessible** (région `aria-live="polite"` mise à jour, ou équivalent testé).
   Ce curseur local n'est PAS le curseur partagé carte↔profil de la 11.5 (ne l'implémente pas),
   mais expose `s` proprement pour qu'elle le branche.
3. **Sans JavaScript** : le profil statique (SVG + légende + synthèse en texte) doit s'afficher
   complet côté serveur ; l'interactivité est une amélioration progressive, chargée **après** le
   contenu (composant client minimal, import différé) ; **aucun JS ajouté au chemin critique de
   l'accueil au-delà de ce que le budget tolère** : mesure et rapporte l'octet.
4. **`prefers-reduced-motion`** : aucune transition nécessaire ; si tu en ajoutes, neutralise-les.
5. Intégration dans `section-parcours.tsx` à l'emplacement annoncé de la visualisation, pour les
   seules épreuves ayant des données ; ne casse pas le sélecteur sans JS (`:has()` + radios) ni la
   structure testée en 9.3 (réaligne seulement ce qui doit l'être, liste-le).
6. Étends le contrat de `section-parcours.ts` si nécessaire (p. ex. `profil` optionnel, `null`
   sans données) — l'API de lecture de `parcours.json` reste côté serveur.

## Tests exigés

Échelle de pente et ses bornes ; fenêtre/lissage ; décimation (erreur max chiffrée) ; rendu SSR du
profil (SVG, légende en toutes lettres, quatre paliers, `aria-hidden` sur le décoratif) ; épreuve
sans données → aucune visualisation ni chiffre ; contrastes AA clair + sombre ; texte accessible du
curseur. Tests existants verts, intention inchangée.

## Contraintes

`pnpm typecheck` (3 paquets), `pnpm test`, `pnpm budget` ≤ 300 Kio verts. Pas de chinois. Pas de
commit. Tue tout serveur lancé (jamais Postgres de dev, jamais le port 3000 de l'utilisateur).

## Livrables

Rapport final honnête : chaque AC *mesuré* / *couvert par test (nom)* / *non vérifiable ici (pourquoi)*
— le rendu visuel réel (couleurs perçues, tap sur téléphone) est non vérifiable sans navigateur :
dis-le ; chiffres (décimation, octets HTML/JS, marge budget), fichiers, nombres de tests.
