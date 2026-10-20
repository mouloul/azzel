# Spine Pair Review — Azzel

Paire : `DESIGN.md` + `EXPERIENCE.md` (ux-Azzel-2026-10-20). Revue rubric walker, 2026-10-20.

## Overall verdict

Paire solide, immédiatement consommable comme contrat par l'architecture et les stories : les 4 UJ sont marchées avec climax et échecs, les 27 tokens couleur ont hex + paire clair/sombre, toutes les références `{path.to.token}` résolvent, et les contrastes énoncés tiennent numériquement (toutes paires porteuses recalculées ≥ 5,4:1, objectif AA+ vérifié). Les gaps sont concentrés et peu nombreux : un état critique manquant (permission caméra refusée pour le scan PWA, jour J sans filet), deux composants sans contrat comportemental complet (ligne de board live, journal sync), et trois désalignements de noms de composants entre spines.

## 1. Flow coverage — verdict : strong

Les 4 UJ du PRD §2.3 sont présentes comme Key Flows, protagoniste nommé avec contexte (Yacine 28 ans, Karim 19 ans, Nadia, Malika), étapes numérotées (11/8/5/4), climax explicites, et chemin d'échec pour chacune (EXPERIENCE.md:186-240). Le mapping FR est affiché par flow ; FR-27 est couvert dans les transverses IA (EXPERIENCE.md:41). Wireflows liés pour UJ-1 et UJ-2.

- `[low]` (EXPERIENCE.md:188) UJ-1 annonce « Réalise FR-1 à FR-7, FR-18 à FR-20 » alors que le PRD §2.3 borne UJ-1 à FR-1 à FR-7 (FR-18–20 y sont rattachés à UJ-4). Élargissement cohérent (la spine intègre l'activation tracking au parcours Yacine) mais le mapping diverge de la source. **Fix** : garder le mapping spine mais ajouter « (étendu vs PRD §2.3 : tracking intégré) » pour éviter qu'un générateur de stories ne remappe à l'aveugle.
- `[low]` (EXPERIENCE.md:204-217, UJ-2) L'amont admin de la chaîne — import Excel volontaires côté organisateur (FR-9) et création secteurs/missions (FR-10) — n'est marché par aucun Key Flow : UJ-2 commence côté volontaire à la réception de l'invitation, UJ-3 au matin du jour J. Les deux FR sont couverts structurellement (IA + State Patterns « Import Excel »), pas dynamiquement. **Fix** : 3 étapes d'intro à UJ-2 (Nadia importe, affecte, couverture vérifiée) ou une phrase pointer vers IA/State Patterns.

## 2. Token completeness — verdict : strong

Les 27 couleurs ont un hex et existent en paire clair/sombre (structure + 5 opérationnelles avec encres) — aucune CRITIQUE. Palette vérifiée identique à la variation 5 de `.working/color-themes-1.html` (source canonique déclarée). Toutes les références `{colors.*}`, `{typography.*}`, `{rounded.*}`, `{spacing.*}` des deux spines résolvent vers le frontmatter DESIGN. Contrastes énoncés pour les combinaisons porteuses et recalculés conformes : encre/brume 13,66:1 (affirmé ~13:1, DESIGN.md:182) ; minimum relevé = blanc/succès clair 5,40:1 — l'objectif ≥ 4,5:1 / ≥ 3:1 (DESIGN.md:196) tient sur les 23 paires testées, deux modes compris.

- `[low]` (DESIGN.md:194, 247) Les paires sombres des opérationnelles ne sont jamais référencées token par token : seul le succès est cité en exemple, les autres passent par la formule générique « paires `-sombre` correspondantes » ; `{colors.texte-2-sombre}` n'est consommé nulle part (prose ni composants). **Fix** : une ligne par opérationnelle sombre dans Colors, ou un mini-tableau fg/bg sombre ; consommer `texte-2-sombre` dans au moins un composant (indicateur de fraîcheur en sombre).

## 3. Component coverage — verdict : adequate

Couverture quasi bijective : 27 composants avec spec visuelle dans DESIGN.Components, 25 lignes comportementales dans EXPERIENCE.Component Patterns, « mêmes noms » déclaré des deux côtés (DESIGN.md:237, EXPERIENCE.md:63). Exemple de paire complète : Bouton assistance (DESIGN.md:241 + EXPERIENCE.md:88, SM-C1 cité). Trois exceptions :

- `[medium]` (DESIGN.md:251 vs EXPERIENCE.md:73) **Ligne de board live** : spec visuelle dédiée (gras, badge, mono, pointillés) mais zéro règle comportementale propre — elle n'apparaît qu'en parenthèse dans « Tableau de bord live ». Tri, ordre d'affichage, mise à jour temps réel, interaction éventuelle non spécifiées ; c'est pourtant le composant central du PC course. **Fix** : une ligne dédiée dans Component Patterns (tri par heure de passage décroissante, mise à jour realtime sans flash complet, non cliquable en V1 ou comportement défini).
- `[medium]` (EXPERIENCE.md:99, 137) **Journal sync** : mentionné deux fois comme « consultable » (lots, rejets, offsets horloge) mais aucun composant ne le porte — ni visuel (DESIGN) ni comportemental. Le dev de story devra inventer la surface d'un élément d'auditabilité déclaré « prime ». **Fix** : entrée Journal sync dans DESIGN.Components (liste mono sur carte, {typography.meta}) + Component Patterns (accès depuis le bandeau sync, lecture seule).
- `[low]` (EXPERIENCE.md:156) **Grand écran de la place du village** : surface évoquée une fois (« Résultats en direct également affiché sur le grand écran ») sans composant, sans ligne Responsive, sans source PRD. Si c'est la vitrine affichée en boucle, une phrase suffit à le dire. **Fix** : « il s'agit de la vitrine publique en plein écran, pas d'une surface dédiée » ou spécifier.

## 4. State coverage — verdict : adequate

Solide sur le cœur produit : hors-ligne planifié, sync attente/envoyée, erreur API enveloppe unique, temps provisoire/doublons neutres, fraîcheur/figée, permission localisation refusée, session révoquée, upload CCP, chargement à froid, dossier vide, missions vacantes, import Excel — 13 états avec traitement (EXPERIENCE.md:93-109). Trous sur les états d'échec edge :

- `[high]` (EXPERIENCE.md State Patterns, absence) **Permission caméra refusée / caméra indisponible** sur la PWA volontaires : le scan est LA fonction jour J sans filet, or aucun état ne couvre « caméra bloquée », « permission refusée », « caméra occupée ». Le fallback `@zxing/browser` est couvert (Responsive), pas la permission. Un dev de story scan devra inventer le contrat le pire jour possible. **Fix** : ligne State Patterns (détection au premier lancement du scanner → écran dédié « Autoriser la caméra » avec chemin Réglages, mirroring du Guide permission iOS + assistance PC) + étape d'échec dans UJ-2.
- `[medium]` (EXPERIENCE.md:100-105 ; UJ-1 étape 2) **Code email erroné/expiré** : FR-1 exige « un code expiré ou erroné ne crée pas de compte » ; ni State Patterns ni les échecs d'UJ-1 ne traitent la saisie de code invalide. **Fix** : état dédié (message + renvoi limité, cohérent avec la limitation de rythme d'envoi) + mention dans les échecs UJ-1.
- `[medium]` (EXPERIENCE.md:105) **Rejet de format à l'upload** : l'état « Upload preuve CCP » couvre compression et feedback, pas le rejet des formats non image/PDF exigé par FR-4 (« message clair »). **Fix** : compléter la ligne (rejet côté client avant envoi, message reprenant les formats acceptés).
- `[medium]` (absence ; cf. `reconcile-azronthor.md` §Double CTA) **États temporels de la vitrine** : avant/pendant/après course — CTA adapté à la phase (inscription → live → résultats) promis par la réconciliation mais absent des State Patterns ; l'état « résultats vides avant départ » non plus. **Fix** : trois colonnes d'état vitrine (avant : CTA S'inscrire dominant ; pendant : Résultats en direct + témoin ; après : résultats + historique) ou renoncer explicitement dans les Questions ouvertes.
- `[low]` (EXPERIENCE.md:102) Classement vide / « pas encore de partants » sur la vitrine : couvert seulement implicitement par la ligne Fraîcheur. **Fix** : libellé dédié dans la ligne Fraîcheur.

## 5. Visual reference coverage — verdict : strong

Les 8 artefacts visuels de `.working/` sont tous liés inline à la section pertinente en nommant ce qu'ils illustrent : les 5 HTML dans DESIGN.md:172 (color-themes-1 comme source canonique des hex, direction-village retenu avec sa divergence de palette énoncée, les 3 directions écartées pour contraste — re-citées dans EXPERIENCE.md:170) ; les 3 excalidraw dans EXPERIENCE (ia → IA:31, flow-app-coureur → UJ-1:188, flow-scan → UJ-2:206). `imports/` vide. La règle « spines gagnent » est énoncée une fois (EXPERIENCE.md:27) et démontrée par un vrai cas : le wireflow app coureur contient bien « certificat médical / pièce d'identité » (vérifié dans le JSON) et la spine tranche « la PRD fait foi — décharge, règlement, preuve CCP ». Aucune référence vague aux maquettes.

- `[low]` (WS/.working/) Orphelins : `source-extract-architecture.md`, `source-extract-brief.md`, `source-extract-prd.md` — notes de travail non liées. Tolérable (ce ne sont pas des artefacts visuels) mais la règle « tout fichier .working est lié » n'est pas tenue à la lettre. **Fix** : une ligne dans IA ou Foundation (« extraits de sources : .working/source-extract-*.md ») ou déplacement hors .working.

## 6. Bloat & overspecification — verdict : strong

DESIGN porte la voix éditoriale (Brand & Style, registre Village) — légitime ; EXPERIENCE reste factuelle, en tableaux, sans prose éditoriale. Les détails pixel (9 px, lift 2 px, pulsation 1,5 s) vivent dans DESIGN où ils sont de la spec visuelle, pas de l'overspec. Le tableau IA reprend le PRD mais y ajoute l'accès et le contenu par surface — valeur aval réelle. MoSCoW verbatim (Should/Could sur vidéo, témoignages, galerie) sans redéfinition.

- `[low]` (EXPERIENCE.md:41, 100-101, 134-141, 217) La formule « l'appareil propose, le serveur dispose » et ses corollaires (jamais de suppression locale, lots idempotents) reviennent à 4 endroits. Cœur produit assumé, mais un patch sur l'un des 4 endroits dérivera. **Fix** : garder la section « Offline & Synchronisation » comme canon, les autres occurrences deviennent des renvois.

## 7. Inheritance discipline — verdict : strong

Les 5 sources du frontmatter EXPERIENCE résolvent (chemins vérifiés). Le vocabulaire des sources est repris fidèlement et activement : outbox append-only, lots idempotents, clé `(édition, coureur, checkpoint)` = AD-8, jeton unique édition dans le QR = AD-8, session unique + jeton d'appareil = AD-5, enveloppe d'erreur unique = convention « État & erreurs », SSE/polling + realtime réservé admin = convention « Canaux publics », BarcodeDetector/@zxing iOS = convention « Scan QR », NTP/dry-run/3 scanneurs/~700-300/powerbanks = addendum brief, J-10 = FR-26. Les refs token EXPERIENCE → DESIGN résolvent toutes. SM-C1/SM-C2/SM-5/FR-27 cités à bon escient.

- `[low]` (EXPERIENCE.md:186 vs PRD §2.3) Titre d'UJ-1 reformulé : « Yacine s'inscrit, installe l'app et boucle son dossier seul » vs source « Yacine s'inscrit à la longue et boucle son dossier seul ». UJ-2/3/4 quasi verbatim. **Fix** : conserver le libellé source en préfixe (« UJ-1 — Yacine s'inscrit à la longue et boucle son dossier seul ; la spine étend à l'installation et au tracking »).
- Voir cat. 3 pour les noms de composants non identiques entre spines — c'est le point d'inheritance le plus fragile, traité ci-dessus et en Mechanical notes.

## 8. Shape fit — verdict : strong

DESIGN : les 8 sections canoniques présentes dans l'ordre verrouillé exact (Brand & Style → Do's and Don'ts). Frontmatter conforme au spec (name, description, colors kebab-case hex, typography nested, rounded avec DEFAULT/full, spacing nommés, components avec refs). EXPERIENCE : tous les defaults présents (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows) ; triggered présents tous les deux (Inspiration & Anti-patterns avec azronthor, Responsive & Platform) ; Key Flows en dernier comme dans les deux exemples. Sections inventées : « Offline & Synchronisation », « Anonymat & Vie privée », « Jour J — Mode Opératoire » (EXPERIENCE) et « Questions ouvertes » (les deux) — toutes quatre justifiées par le produit (offline-first radical, anonymat carte publique, événementiel daté, hypothèses balisées) et cohérentes avec la pratique des documents amont du projet.

- `[low]` (DESIGN.md:283-287, EXPERIENCE.md:242-253) « Questions ouvertes » n'est pas une section canonique DESIGN — justifiée (lieu de vie des `[ASSUMPTION]`), mais à garder balisée pour ne pas proliférer. **Fix** : aucune si le gabarit du skill l'accepte ; sinon fusionner dans Do's and Don'ts ou un sous-bloc de Brand & Style.

## Mechanical notes

- **Noms de composants divergents entre spines** (la règle déclarée est « mêmes noms ») : « Fiche mission » (DESIGN.md:249) vs « Fiche mission hors-ligne » (EXPERIENCE.md:69) ; « Témoignage » (DESIGN.md:257) vs « Témoignages coureurs » (EXPERIENCE.md:81) ; frontmatter `bloc-video` (DESIGN.md:151) vs prose « Vidéo trailer » (DESIGN.md:256, EXPERIENCE.md:80) ; frontmatter `voyant-scan-succes`/`voyant-scan-danger` vs « Voyant scan » unique en prose. Un consommateur aval qui apparie par nom exact perdra ces paires.
- Frontmatter `components` incomplet vs prose Components (pas d'entrées pour alerte-hors-delais, tableau-de-bord-live, e-dossard complet, fiche-mission…) — la prose porte la spec, non bloquant, mais l'incohérence de granularité mérite un choix assumé.
- DESIGN.md n'a pas de champ `sources` au frontmatter (le spec design-md ne l'exige pas ; EXPERIENCE les porte pour la paire) — noter que la traçabilité DESIGN→sources passe par la prose (.working) uniquement.
- « 1ᵉʳ passage » (EXPERIENCE.md:213) : exposant non standard (préférer « 1ᵉʳ » → « premier » ou « 1er ») ; cosmétique.
- `reconcile-azronthor.md` à la racine du WS (hors `.working/`) : non lié depuis les spines ; sa promesse « double CTA par phase → repris dans EXPERIENCE.md » n'est pas tenue à la lettre (voir finding medium cat. 4).
- Cross-refs vérifiées : tous les chemins `.working/` cités existent ; hex frontmatter = variation 5 de color-themes-1.html (vérifié valeurs à valeurs) ; ombre `rgba(52,94,74,.22)` = action #345E4A ; dégradé bloc-video = surface-sombre→bg-sombre ; contrastes recalculés conformes aux affirmations des deux spines.
- Mapping FR global couvert : FR-1..FR-27 tous présents quelque part entre IA, Component Patterns, State Patterns, Key Flows et Jour J (seul écart : l'amont FR-9/FR-10 non marché en flow, voir cat. 1).

## Décompte

0 critical · 1 high · 5 medium · 8 low
