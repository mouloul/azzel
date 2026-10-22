# Epic 2 Context: Vitrine publique de l'édition

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rendre la course publiquement découvrable sans compte : une vitrine « qui en jette » mais sobre et légère (dates, épreuves, parcours GPX, égide fédération/ministère, sponsors, infos pratiques), qui crédibilise l'organisation auprès des coureurs comme des institutions. La page d'annonce minimale est le jalon du **15/11/2026** (ouverture des inscriptions) ; la vitrine complète (parcours, région, trailer) suit pour le jour J (26/03/2027).

## Stories

- Story 2.1: Page d'annonce publique minimale
- Story 2.2: Identité Village — piliers, frises, sombre
- Story 2.3: Bloc sponsors option A / option B
- Story 2.4: Parcours GPX, consignes et page région
- Story 2.5: Vidéo trailer 1ʳᵉ édition & témoignages coureurs (Should)

## Requirements & Constraints

- Page course publique sans compte : dates, épreuves (Longue ~35 km / Moyenne 10–15 km), dénivelés, horaires, ravitaillements, consignes de sécurité.
- Budget performance dur : premier chargement **< 300 Ko**, premier rendu lisible **< 5 s en 3G lent** ; GPX et médias en chargement différé, jamais dans le chemin critique ; squelettes de chargement calqués sur la mise en page finale.
- Bandeau égide « Sous l'égide de la Fédération et du ministère des Sports » toujours visible.
- Sponsors : option A (sponsor unique, emplacement signature) / option B (multiples, emplacements équivalents) — bascule **sans dev**, configurée depuis l'espace admin, répercutée immédiatement sur la vitrine.
- Infos pratiques et annexes (hébergement, restauration, région, événements annexes) éditables par l'admin sans développement.
- CTA « S'inscrire » mène au parcours de l'épopée 1 ; contact « Appeler l'équipe » visible en bouton (assistance humaine SM-C1), jamais enfoui.
- Page région : contenu éditorial sobre — consigne sécurité « ne pas défier la montagne », note écologie des singes sacrés du Jurjura.
- Trailer/témoignages (Should) : poster léger + lecture au clic uniquement (jamais d'autoplay, hors budget 300 Ko) ; témoignages sobres, pas de carrousel automatique ; désactivation propre si la matière 1ʳᵉ édition manque.
- Rédaction (charte) : français, phrases courtes, voix active, **vouvoiement** sur les pages publiques ; concret (distances, horaires, lieux) ; **ne jamais inventer de chiffres** ; distinguer le réalisé 2026 (279 inscrits, 222 dossards, 214 finishers dont 36 femmes au trail, 116 enfants Course Kids, etc. — ne pas les additionner) du prévu 2027 (écrit comme objectif) ; pas d'emojis. Dates/tarifs/coordonnées 2027 : à confirmer par le comité avant mise en ligne.
- Accessibilité : contrastes AA+ dans les deux thèmes, ocre/highlight réservés aux textes ≥ 24 px, frappe ≥ 15 px sur contenus critiques, focus visible 2 px, zoom 200 %, `prefers-reduced-motion`, jamais la couleur seule.

## Technical Decisions

- La vitrine vit dans `apps/web` (Next.js 16), module `vitrine` — pages publiques, pas de mode hors-ligne (online assumé).
- **Identité du site = charte web Aït Aïssi**, intégrée après l'épopée 1 (commit 821de2d) : `siteTokens` dans `packages/shared` (crème/forêt/ocre, spacing 4–96, radius 4/6/8, shadow-card, container-max, bp 640/960/1280), polices **Barlow Condensed + Inter auto-hébergées** (`apps/web/public/charte/fonts/`, sous-ensembles woff2, `font-display: swap`, preload du seul Barlow 700), logos SVG et classes `aa-` dans `apps/web`. **Elle supplante l'identité provisoire « Vert Djurdjura » de DESIGN.md pour tout apps/web** (webfonts, hero photo, rayons fins) ; `operationsTokens` (Vert Djurdjura) reste réservé aux futures surfaces terrain (PWA scan, PC jour J).
- **Thème par défaut : clair** (`resolveInitialTheme = stored ?? 'light'`, plus de suivi système) ; sombre optionnel via bascule mémorisée — les AC de stories rédigées avant l'intégration qui mentionnent « défaut système » sont caduques sur ce point.
- **Voix mixte** : vouvoiement pages publiques (y compris enveloppes d'erreur), tutoiement espace coureur — déjà en place.
- Photos : vraies photos de l'édition 2026 (assets `charte/photos-2026/`), servies en WebP redimensionnés (640/1280/2048) avec `srcset`, `object-fit: cover` sans déformation ; texte sur photo uniquement sur voile forêt 60–85 % ; pas de banque d'images ; photo d'enfants identifiables soumise à accord. Le budget < 300 Ko prime : lazy-load, aucune image dans le hero critique non optimisée.
- Choix de la bibliothèque cartographique (Leaflet vs MapLibre) et rendu GPX : décision locale au module `vitrine`, différée à l'implémentation.
- Les canaux publics passent par le backend Next.js (cache + SSE/polling), jamais de lecture directe Supabase realtime depuis un navigateur public — pertinent pour les blocs live ajoutés par l'épopée 7, à ne pas bloquer.
- Contenu rattaché au socle multi-organisation (organisation → événement → édition, `organisation_id` + RLS) — la vitrine sert l'édition courante.

## UX & Interaction Patterns

- Structure de référence : arborescence conseillée de la charte (accueil, week-end, disciplines, inscriptions, partenaires, galerie, contact) ; conteneur centré `container-max`, sections alternant `surface`/`forest-surface`, grilles 1/2/3 colonnes, mobile-first fonctionnel à 360 px sans défilement horizontal.
- Titres de section : `eyebrow` en accent (Barlow Condensed CAPITALES) puis titre ; grands chiffres en `stat` ocre ≥ 24 px avec label, `tabular-nums` dans les tableaux ; paragraphes ≤ 68 caractères.
- Identité amazighe « qui se respire, ne s'expose pas » : 4 piliers sport/santé/citoyenneté/écologie avec glyphe SVG inline 20–24 px monochrome (ⵣ Yaz, tala, tabzimt, ingel) ; frise kabyle en seuils tête/pied, décorative `aria-hidden`, jamais derrière du texte ; interdits : « Tafsut » comme label, symboles politiques/sacrés détournés, mascotte, médaillon.
- Citations kabyles uniquement aux points d'usage : « Aman d laman » réservée aux ravitaillements/page région, source Hanoteau 1867 notée ; jamais groupées en section, jamais sur l'accueil.
- Logo : complet 40 px desktop / 32 px mobile, symbole seul si en-tête < 160 px, zone de protection = moitié de la hauteur du symbole ; favicon = symbole.
- Un seul bouton action par vue (CTA « S'inscrire » dominant avant-course) ; bouton contour pour l'alternative ; bouton assistance au libellé explicite.
- Trailer : poster dégradé + bouton lecture, chargement au clic seulement.

## Cross-Story Dependencies

- 2.1 s'appuie sur le scaffold de l'épopée 1 (`apps/web`, `siteTokens`, thème clair, header logo — déjà en place) et pointe le CTA vers le parcours d'inscription de l'épopée 1 ; **2.1 (+2.2) est le jalon 15/11/2026**.
- 2.3 (config sponsors) et 2.4 (édition des infos pratiques) introduisent des capacités d'édition admin nouvelles, à construire dans cette épopée.
- 2.4 et 2.5 enrichissent la vitrine complète (post-annonce) ; 2.5 dépend de la vérification de la matière 1ʳᵉ édition (photos/vidéo) — question ouverte, dégradation propre exigée si absente.
- L'épopée 7 greffera plus tard résultats live et carte publique sur cette vitrine (témoin live, fraîcheur, canaux SSE/polling) : ne rien verrouiller qui l'empêche.
