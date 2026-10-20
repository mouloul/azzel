# Réconciliation UX — inspiration azronthor.com → Azzel

Source : https://azronthor.com/ (Trail Azro n'thor, village de Tirourda, Kabylie — site WordPress).
L'utilisateur aime : l'ambiance visuelle, la structure de la vitrine, les signaux de crédibilité, l'ancrage humain et local.
Contraintes canoniques (.memlog.md) : direction VILLAGE, palette Vert Djurdjura, sombre optionnel partout, vitrine < 300 Ko / < 5 s en 3G **sans images lourdes**, interface française, « qui en jette » mais sobre et crédible.

## Ce qu'on retient (et où ça atterrit)

- **Structure de vitrine complète** (hero date/départs, parcours par distance avec points ITRA, équipe organisatrice avec visages et rôles, témoignages, galerie, sponsors/partenaires, contact) → **EXPERIENCE.md · Information Architecture** : c'est le plan de référence de la vitrine Azzel. Le hero azronthor condense en un écran : date, deux départs horodatés par distance, lieu-dit village → repris tel quel pour Azzel (26/03/2027, départs par course, village d'Ait-Aissi).
- **Signaux de crédibilité** : azronthor affiche ITRA / UTMB Index / ITRA Green Program dès le hero → **DESIGN.md · Brand & Style + composants vitrine** : Azzel affichera l'égide « sous l'égide de la Fédération » + ministère des Sports (homologation), dans une bande de logos officielle au-dessus de la ligne de flottaison. Même fonction (rendre la course sérieuse), autorités différentes.
- **Ancrage humain** (photos de l'équipe, rôles nommés — directeur de course, responsable technique, directeur médical… — et village nommé partout) → **direction VILLAGE** déjà actée : visages/équipe mis en avant, rôles explicites, mention récurrente du village d'Ait-Aissi. La grille équipe d'azronthor (portrait + nom + fonction) devient un composant vitrine Azzel — portraits en images légères/optimisées pour respecter le budget 300 Ko.
- **Ambiance montagne immersive** : l'effet « grand air » d'azronthor vient de grandes photos → chez Azzel, le même ressenti sera obtenu par **dégradés Vert Djurdjura, silhouettes de crêtes en SVG léger, motifs géométriques kabyles discrets** (décision : pas de photos lourdes). → **DESIGN.md · Brand & Style** (atmosphère) et **DESIGN.md · composants** (hero sans photo-first).
- **Double CTA vitrine** (azronthor : Inscription / Résultats / Photos dans le hero) → logique de statut de l'événement reprise dans EXPERIENCE.md : la vitrine Azzel adapte ses CTA à la phase (avant/pendant/après course) — inscription native, puis suivi live, puis résultats.

## Ce qu'on écarte (et pourquoi)

- **Hero photo-first lourd** (grandes photos montagne en JPEG plein écran) : incompatible avec le budget < 300 Ko / < 5 s en 3G. Remplacé par dégradés + SVG (voir ci-dessus).
- **Pagination WordPress multi-éditions** (une page arborescente par édition 2017→2023 + sous-menu déroulant) : Azzel est un socle multi-organisation — une vitrine par édition, pas un empilement de pages historiques dans la navigation. L'historique éventuel sera une donnée de l'organisation, pas des pages dédiées.
- **Inscriptions externalisées** (CTA vers acgaya.dz) : Azzel a des inscriptions natives dans la plateforme — le CTA reste interne, pas de redirection tierce.
- **Témoignages statiques multilingues** (blocs FR/AR à la chaîne, drapeaux emoji) : hors périmètre MVP — V1 français seul, i18n non préparé (décision .memlog). Le composant témoignage lui-même n'est pas retenu pour le MVP (voir idées perdues).
- **Résultats et photos hébergés chez des tiers** (runnertag.site pour les photos, liens externes pour les résultats) : Azzel héberge résultats et contenus nativement (offline-first, données plateforme) ; dépendre de services tiers contredit la promesse produit.

## Idées qualitatives perdues — à soumettre à l'utilisateur

Idées d'azronthor non reprises (hors périmètre MVP ou en conflit avec des décisions canoniques), à arbitrer avec l'utilisateur :

- **Section témoignages coureurs** (citations réelles, visages, ressenti post-course) — fort pour la crédibilité et l'émotion, mais contenu à produire et modérer ; à récupérer plus tard si le temps le permet (Should/Could).
- **Galerie photos par édition** — puissante pour l'ambiance, mais conflit direct avec le budget 300 Ko/3G et l'hébergement de médias ; envisageable en Should/Could via un lien externe ou des miniatures lazy-load hors budget critique.
- **Historique des éditions passées avec pages dédiées** (archives 2017→2023) — construit la légitimité « ça existe depuis longtemps » ; Azzel 2027 est une première édition sous la plateforme, donc peu de matière ; à récupérer plus tard si le temps le permet (Should/Could), porté par le socle multi-organisation.
- **Bandeau partenaires/sponsors à logos** (GIG, médias locaux…) — retenu dans la structure, mais la collecte des logos et leur poids restent à arbitrer (miniatures optimisées obligatoires) ; à confirmer avec l'utilisateur selon les sponsors réels.
