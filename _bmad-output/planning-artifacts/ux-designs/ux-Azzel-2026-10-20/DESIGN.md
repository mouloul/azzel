---
name: Azzel
description: Système visuel d'Azzel — plateforme clé en main de gestion de course de trail offline-first. Registre « Village » (chaleureux citoyen-local), palette « Vert Djurdjura », typographie humaniste arrondie, motifs kabyles discrets. « Interface qui en jette » sobre, sans images lourdes.
status: final
created: 2026-10-20
updated: 2026-10-20
colors:
  # Mode clair — structure
  bg: '#EDF2EB'
  surface: '#FAFCF8'
  texte: '#16281C'
  texte-2: '#4A6252'
  action: '#345E4A'
  action-texte: '#EFF8F2'
  # Mode clair — opérationnelles jour J (encre blanche)
  succes: '#187A3C'
  succes-encre: '#FFFFFF'
  danger: '#B3261E'
  danger-encre: '#FFFFFF'
  attention: '#8A5A00'
  attention-encre: '#FFFFFF'
  sync-attente: '#6B5A33'
  sync-attente-encre: '#FFFFFF'
  sync-envoye: '#2E6570'
  sync-envoye-encre: '#FFFFFF'
  # Mode sombre — structure
  bg-sombre: '#101A14'
  surface-sombre: '#1B281F'
  texte-sombre: '#E8F0E9'
  texte-2-sombre: '#A9C0AE'
  action-sombre: '#8FD4A8'
  action-texte-sombre: '#0C2415'
  # Mode sombre — opérationnelles jour J
  succes-sombre: '#62D288'
  succes-encre-sombre: '#07290F'
  danger-sombre: '#FF7268'
  danger-encre-sombre: '#340905'
  attention-sombre: '#F0B445'
  attention-encre-sombre: '#302205'
  sync-attente-sombre: '#C4A366'
  sync-attente-encre-sombre: '#291D04'
  sync-envoye-sombre: '#74C7D6'
  sync-envoye-encre-sombre: '#06262C'
typography:
  display:
    fontFamily: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    fontSize: 62px
    fontWeight: '800'
    lineHeight: '1.04'
  display-sm:
    fontFamily: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    fontSize: 24px
    fontWeight: '800'
  surtitre:
    fontFamily: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    fontSize: 13.5px
    fontWeight: '700'
    letterSpacing: 0.14em
  body-lg:
    fontFamily: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    fontSize: 16.5px
    fontWeight: '400'
    lineHeight: '1.75'
  body:
    fontFamily: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.7'
  meta:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    fontSize: 12px
    fontWeight: '400'
  meta-lg:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    fontSize: 15px
    fontWeight: '400'
  dossard:
    fontFamily: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    fontSize: 74px
    fontWeight: '800'
    lineHeight: '1'
rounded:
  sm: 8px
  md: 16px
  lg: 24px
  full: 9999px
  DEFAULT: 16px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  gutter: 24px
  margin-mobile: 20px
components:
  bouton-action:
    background: '{colors.action}'
    foreground: '{colors.action-texte}'
    radius: '{rounded.full}'
    fontWeight: '700'
  bouton-contour:
    border: '2px solid {colors.action}'
    foreground: '{colors.texte}'
    radius: '{rounded.full}'
    fontWeight: '700'
  carte:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    borderWidth: '1px'
  badge-dossard:
    background: '{colors.action}'
    foreground: '#FFFFFF'
    radius: '{rounded.sm}'
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    fontWeight: '700'
  temoin-live:
    background: '{colors.danger}'
    size: 9px
    radius: '{rounded.full}'
  # Voyant scan — un composant, deux états (succès / danger)
  voyant-scan:
    background: '{colors.succes}'
    foreground: '{colors.succes-encre}'
    radius: '{rounded.full}'
  bandeau-sync-attente:
    background: '{colors.sync-attente}'
    foreground: '{colors.sync-attente-encre}'
    radius: '{rounded.sm}'
  bandeau-sync-envoye:
    background: '{colors.sync-envoye}'
    foreground: '{colors.sync-envoye-encre}'
    radius: '{rounded.sm}'
  journal-sync:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    entryFont: '{typography.meta-lg}'
  avatar-initiales:
    background: '{colors.action}'
    foreground: '{colors.action-texte}'
    radius: '{rounded.full}'
    fontWeight: '800'
  bandeau-egide:
    background: '{colors.action}'
    foreground: '{colors.action-texte}'
  e-dossard-qr:
    background: '#FFFFFF'
    foreground: '{colors.texte}'
    radius: '{rounded.md}'
  temoignages-coureurs:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    citationFont: '{typography.body-lg}'
  bloc-video:
    background: 'linear-gradient(#1B281F, #101A14)'
    radius: '{rounded.lg}'
    playButton: '{colors.action-sombre}'
  galerie-photo:
    radius: '{rounded.md}'
    loading: 'lazy'
  glyphe-pilier:
    color: '{colors.action}'
    size: '20-24px'
  citation-kabyle:
    font: '{typography.body-lg}'
    sourceFont: '{typography.meta}'
---

## Brand & Style

Azzel est la vitrine d'un **projet sportif-citoyen outillé dont la réputation est le produit**. La direction retenue est **Village** : « une course portée par son village » — chaleur citoyenne (bénévoles, hameaux, écoles), sérieux technique sans froideur. Sérieux et chaleur ne s'opposent pas : ils se serrent la main.

Le système doit convaincre deux publics en même temps : les coureurs (expérience « pro », « interface moderne qui en jette ») et les institutions (fédération, ministère des sports, sponsors, médias — sobriété crédible). La réponse : un langage humaniste arrondi, une palette de forêt de montagne kabyle, des visages et des chiffres du village mis en avant, et des motifs géométriques kabyles posés en seuils discrets — jamais en décor envahissant.

Quatre thèmes structurels — sport, santé, citoyenneté, écologie — s'affichent comme des piliers, pas comme des badges marketing. Le zéro papier (e-dossard QR) est une signature écologique assumée.

**Dimension amazigh — elle se respire, elle ne s'expose pas.** Pas de section dédiée, pas d'apparat : chaque pilier (sport, santé, citoyenneté, écologie) porte un **petit glyphe inline** (20–24 px) tiré du patrimoine kabyle vérifié (recherche : `.working/research-amazigh-mythologie.md`, `.working/research-poesie-kabyle.md`) : **ⵣ Yaz** « homme libre » (sport), **tala** la fontaine (santé), **tabzimt** la fibule (citoyenneté), **ingel** le cèdre de l'Atlas (écologie) — même langue graphique que la frise, monochrome sapin. Les proverbes anciens (domaine public, source Hanoteau 1867 notée) n'apparaissent qu'aux points d'usage définis dans `EXPERIENCE.md` → Voice and Tone — jamais groupés en section. Interdits explicites : le mot « Tafsut » comme label (charge politique documentée), drapeau amazigh, détournement de symboles sacrés ou politiques en logo, signification inventée d'un motif, mascotte, médaillon-exposition des signes.

« Qui en jette » sans images lourdes : l'effet visuel vient des dégradés, du SVG inline et de la typographie. Budget vitrine : premier chargement < 300 Ko, premier rendu lisible < 5 s sur 3G lent. Aucune webfont chargée ; aucune photo pleine largeur en hero.

Le mode sombre est **optionnel partout** — basculable par l'utilisateur sur toutes les surfaces (vitrine, espace coureur web, PWA volontaires, app native, admin). Défaut : préférence système ; choix mémorisé ; bascule visible dans l'en-tête de chaque surface.

Références visuelles : `mockups/color-themes-1.html` (variation 5 · Vert Djurdjura — source canonique des hex ci-dessus), `mockups/direction-village.html` (registre Village : structure vitrine, frises, égide, e-dossard sombre — la palette terre/olive de cette maquette est remplacée par Vert Djurdjura), `mockups/key-vitrine.html` (écran clé 1:1 de la vitrine : phase avant-course — hero, piliers sceautés, épreuves, trailer, sponsors, région, assistance, égide — et phase pendant-course avec le bloc « Résultats en direct »). Directions écartées pour contraste : `.working/direction-altitude.html`, `.working/direction-sport-data.html`, `.working/direction-zenithal.html`.

## Colors

Palette **Vert Djurdjura** (variation 5 retenue) : verts de sapins et d'altitude de la montagne kabyle — fraîcheur, profondeur, silhouette forestière. Chaque rôle existe en paire clair/sombre ; les hex ci-dessus sont exacts (source : variation 5 de `mockups/color-themes-1.html`) et repris tels quels par le code.

**Structure — mode clair**

- **Brume (`{colors.bg}`)** — fond principal. La page respire comme une clairière ; jamais utilisé pour du texte.
- **Surface (`{colors.surface}`)** — cartes, fiches, panneaux. Se distingue du fond par le ton, pas par l'ombre.
- **Encre (`{colors.texte}`)** — texte courant ; contraste ~13:1 sur la brume.
- **Encre secondaire (`{colors.texte-2}`)** — légendes, valeurs, fraîcheur. Jamais pour du texte critique.
- **Sapin (`{colors.action}` / `{colors.action-texte}`)** — la seule couleur de marque : CTA « S'inscrire », liens, badges dossard, bandeau égide, avatars. Pas de deuxième accent décoratif.

**Opérationnelles jour J — mode clair** (encre blanche). Réservées à leur sémantique, jamais détournées :

- **Succès (`{colors.succes}`)** — bip/voyant vert de scan, dossier validé, envoi de lot.
- **Danger (`{colors.danger}`)** — doublon, dossard inconnu, alerte hors-délais, témoin « en direct ». Jamais pour un CTA.
- **Attention (`{colors.attention}`)** — batterie < 15 %, avertissements. Jamais comme punition.
- **Sync attente (`{colors.sync-attente}`)** — file d'envoi locale (« 217 passages en attente »).
- **Sync envoyé (`{colors.sync-envoye}`)** — confirmation de lot (« → envoyés »).

**Mode sombre** — Noir-vert (`{colors.bg-sombre}`) en fond, Surface forêt (`{colors.surface-sombre}`) en cartes, texte Brume inversée (`{colors.texte-sombre}`). L'action devient **Vert altitude (`{colors.action-sombre}`)** sur encre sombre (`{colors.action-texte-sombre}`). Les cinq opérationnelles s'éclaircissent et inversent leur encre pour garder AA+ en faible lumière — utile aux départs à l'aube et aux postes de nuit.

| Opérationnelle (mode sombre) | Fond | Encre |
|---|---|---|
| Succès | `{colors.succes-sombre}` | `{colors.succes-encre-sombre}` |
| Danger | `{colors.danger-sombre}` | `{colors.danger-encre-sombre}` |
| Attention | `{colors.attention-sombre}` | `{colors.attention-encre-sombre}` |
| Sync attente | `{colors.sync-attente-sombre}` | `{colors.sync-attente-encre-sombre}` |
| Sync envoyé | `{colors.sync-envoye-sombre}` | `{colors.sync-envoye-encre-sombre}` |

Règles transverses : filets = encre à 25 % d'opacité (clair) / texte sombre à 22 % (sombre) ; voiles d'overlay caméra = surface quasi opaque (≥ 96 %) derrière tout texte du pied de cadre, ou texte sur pastille pleine ; contrastes visés ≥ 4,5:1 sur textes courants, ≥ 3:1 sur grands textes, dans les deux modes.

## Typography

Aucune webfont. La voix typographique est une **stack système humaniste arrondie** (`ui-rounded` et équivalents) — ronde, chaleureuse, lisible sur Android d'entrée de gamme comme sur iOS. Les horodatages, fraîcheurs, numéros de dossard et mentions techniques sont en **mono système**, en deux corps — `{typography.meta-lg}` (15 px) pour les données critiques, `{typography.meta}` (12 px) pour le reste : le mono distingue ce qui est horodaté ou machine de ce qui est parole humaine.

- `{typography.display}` — hero de la vitrine (nom de la course). Rare : une à deux occurrences par page.
- `{typography.display-sm}` — titres de section. Les maquettes montrent 20–26 px sur les cartes ; l'échelle homogénéise à 24 px, les cartes mineures passent en `{typography.body}` gras 700.
- `{typography.surtitre}` — surtitres en capitales très espacées (0.14 em) : « 2ᵉ édition », étiquettes de tableau. C'est le seul usage des capitales.
- `{typography.body-lg}` — chapeaux éditoriaux (lead du hero, citations).
- `{typography.body}` — texte courant, formulaires, fiches mission. Frappe généreuse : la taille ne descend jamais sous 15 px pour les contenus critiques (coureurs peu à l'aise avec le numérique).
- `{typography.meta-lg}` — mono 15 px, plancher des contenus critiques : fraîcheur (« synchronisé il y a 3 min »), heures de passage, bandeau e-dossard.
- `{typography.meta}` — mono 12 px : légendes de galerie et notes — jamais une donnée critique du jour J.
- `{typography.dossard}` — numéro de dossard sur l'e-dossard, chiffres du village. Le chiffre est le héros.

Sur mobile, `display` descend — cible 44–48 px `[ASSUMPTION]` : les maquettes ne figent que le desktop (62 px) ; à valider sur écrans hétérogènes. Le dynamic type / taille système est honoré là où la plateforme le propose `[ASSUMPTION]`.

## Layout & Spacing

Échelle 4 → 48 px (`{spacing.1}` … `{spacing.7}`). Les grands écarts séparent les sections majeures ; les petits, les éléments liés. Gouttière standard `{spacing.gutter}` ; marges latérales mobiles `{spacing.margin-mobile}` — le contenu est cadré comme une page, jamais collé aux bords.

- **Vitrine (desktop ≥ 1200 px)** : hero éditorial deux colonnes (texte ~1.05 / illustration ~0.95), respiration verticale de 44–48 px entre les sections. Une seule colonne dès le mobile.
- **Espace coureur web / PWA volontaires / app native** : une colonne toujours ; gros éléments tactiles ; la caméra de scan prend tout l'écran.
- **Performance** : illustrations hero en SVG inline (~25 Ko HTML+CSS dans la maquette de référence), tracé GPX en chargement différé, zéro photo en hero.

## Elevation & Depth

La hiérarchie vient du **ton** (surface sur fond) et de la typographie, jamais de l'ombre. Les ombres existent mais discrètes : très diffuses (grand rayon de flou), basse opacité, teintées sapin (`rgba(52, 94, 74, 0.22)` en clair — jamais de noir pur). Le survol d'une carte la soulève de 2 px avec ombre chaude. Aucune superposition de modales à plus d'un niveau.

## Shapes

Coins ronds humanistes — la douceur d'une maison ouverte, pas l'angulosité d'un outil ni la pilule d'une app tech :

- `{rounded.sm}` (8 px) — badges dossard, champs, bandeaux sync.
- `{rounded.md}` (16 px) — cartes internes, vues hero, carte QR de l'e-dossard.
- `{rounded.lg}` (24 px) — cartes majeures (épreuves, citations, board), fenêtres.
- `{rounded.full}` — boutons, chips thématiques, avatars, témoins, voyants.

Les maquettes montrent 16–18 px et 24–26 px selon les contextes ; l'échelle homogénéise à 16/24. Le QR reste sur carte **blanche** à coins `{rounded.md}`, modules encre (`{colors.texte}`) : scan assuré même quand la lumière manque. Les images suivent exactement les coins de leur conteneur.

## Components

Spécifications visuelles ; les règles comportementales vivent dans `EXPERIENCE.md` → Component Patterns (mêmes noms). Règle transverse : tout clignotement est borné ≤ 1 flash/s (période ≥ 1 s), jamais de stroboscope (photosensibilité, WCAG 2.3.1) — voyant scan danger comme alerte hors-délais.

- **Bouton action** — pill `{rounded.full}`, fond `{colors.action}`, texte `{colors.action-texte}`, gras 700. Un seul par vue (inscription, « Activer »).
- **Bouton contour** — pill, bordure 2 px `{colors.action}`, texte `{colors.texte}` (« Venir encourager », « Plus tard »). Sombre : bordure `{colors.action-sombre}`, texte `{colors.texte-sombre}`.
- **Bouton assistance** — variante contour, libellé explicite (« Appeler l'équipe »), jamais réduit à une icône, jamais enfoui. Obligatoire dans l'enveloppe d'erreur, l'email de refus de dossier, la checklist incomplète et les infos pratiques de la vitrine (contact en bouton, jamais enfoui).
- **Carte** — `{colors.surface}`, filet 1 px (encre 25 % clair / texte sombre 22 %), `{rounded.lg}`. Le conteneur de tout contenu structuré.
- **Badge dossard** — mono gras, fond `{colors.action}`, texte blanc, `{rounded.sm}`. Sombre : fond `{colors.action-sombre}`, texte `{colors.action-texte-sombre}`.
- **Témoin live** — point 9 px `{colors.danger}`, pulsation 1,5 s. Signale « en direct » ; statique si `prefers-reduced-motion`.
- **Caméra scan plein écran** — viseur plein cadre, cadre de visée blanc, ligne de balayage ; badge « · LIVE » en `{typography.meta}`, heure locale en `{typography.meta-lg}` ; tout texte du pied de cadre (badge, overlay dossard, voyant) sur voile quasi opaque ≥ 96 % ou pastille pleine — jamais sur voile léger.
- **Voyant scan** — pill plein cadre ≥ 96 px de haut, graisse ≥ 700 sur tout le composant, lisible à bout de bras : succès `{colors.succes}`/`{colors.succes-encre}` « ✓ Passage enregistré » en ≥ 24 px graisse 800 + heure mono `{typography.meta-lg}` (≥ 16 px) ; danger `{colors.danger}`/`{colors.danger-encre}` « ↻ DÉJÀ PASSÉ » / « ⚠ DOSSARD INCONNU » en ≥ 24 px graisse 800, lampe clignotante ≤ 1 flash/s (période ≥ 1 s). Doublon et inconnu différenciés par icône (↻ / ⚠) et position ; sémantique danger inchangée. État inconnu : bouton « Appeler le PC » en pastille inversée (encre danger sur `{colors.danger}`). Maquette 1:1 — caméra plein écran, trois états du voyant, bandeau sync, thème sombre : `mockups/key-scan.html`.
- **Bandeau sync** — pill `{rounded.sm}` : attente `{colors.sync-attente}` « ◷ N passages en attente » ; envoyé `{colors.sync-envoye}` « ✓ envoyés — file : 0 ». Sombre : paires `-sombre` correspondantes.
- **Journal sync** — carte `{colors.surface}` `{rounded.lg}`, entrées en `{typography.meta-lg}` : lots envoyés, rejets, offsets horloge. Lecture seule.
- **E-dossard** — carte `{colors.surface-sombre}`, numéro en `{typography.dossard}` `{colors.texte-sombre}`, nom du coureur, frise discrète en tête, badge « HORS-LIGNE PRÊT » en `{typography.meta-lg}`, QR sur carte blanche (`{colors.texte}` sur `#FFFFFF`). Maquette 1:1 — checklist incomplète + e-dossard hors-ligne : `mockups/key-edossard.html`.
- **Fiche mission hors-ligne** — carte : secteur, rôle, horaires, contact PC, consignes en listes courtes `{typography.body}` ; contacts cliquables.
- **Checklist dossier** — lignes d'état : fait = puce `{colors.succes}` ; à faire = texte `{colors.texte-2}` **et** l'action nommée en lien `{colors.action}`. Tout vert → bandeau « Dossier validé — dossard prêt ».
- **Ligne de board live** — position en gras, badge dossard, légende `{colors.texte-2}`, heure mono `{typography.meta-lg}` alignée à droite ; séparateurs pointillés, jamais de zébrage.
- **Tableau de bord live** — agrégat de lignes de board par checkpoint (retraits, partants, en course, arrivés, abandonnés) sur carte ; chiffres en `{typography.display-sm}`, indicateur de fraîcheur en pied ; rafraîchi en realtime (réservé admin). Maquette 1:1 — agrégats, lignes de board, alerte hors-délais : `mockups/key-pc-live.html`.
- **Alerte hors-délais** — bloc `{colors.danger}`/`{colors.danger-encre}`, clignotement lent (période ~1,1 s — ≤ 1 flash/s), texte intégral — la couleur ne porte jamais seule.
- **Carte publique** — tracé GPX (chargement différé), checkpoints marqués, coureurs = pastilles dossard `{colors.action}` ; positions de plus d'une heure en opacité réduite ; pas de noms.
- **Bloc sponsors** — option A : un emplacement signature (nom du sponsor en `{typography.display-sm}`) ; option B : grille d'emplacements équivalents ; la bascule ne demande pas de dev.
- **Vidéo trailer** (bloc-video) *(Should)* — présente l'événement avec les images de la 1ʳᵉ édition : poster léger (dégradé forêt + silhouettes SVG de crêtes) coiffé d'un bouton lecture `{rounded.full}` `{colors.action-sombre}` (8,87:1 sur le dégradé sombre, identique dans les deux modes) ; la vidéo ne charge qu'au clic — jamais d'autoplay, jamais dans le chemin critique < 300 Ko ; en lecture, le lecteur prend les coins `{rounded.md}` de sa carte.
- **Témoignages coureurs** *(Should)* — carte `{colors.surface}` `{rounded.lg}`, citation en `{typography.body-lg}` italique, avatar initiales + prénom + édition de référence en `{typography.meta}` ; sobre, jamais en carrousel automatique.
- **Galerie photos** *(Could)* — grille d'images `{rounded.md}` en chargement différé (lazy), aucune dans le hero ; légendes en `{typography.meta}` `{colors.texte-2}`.
- **Avatar initiales** — cercle `{rounded.full}`, initiales en 800, alternance sobre `{colors.action}` / `{colors.texte-2}` sur texte `{colors.action-texte}` ; photos réelles possibles ultérieurement, l'initiale reste le repli.
- **Frise kabyle** — bandeau décoratif SVG (motifs géométriques simples), **monochrome sapin** `{colors.action}` sur `{colors.surface}` (décision 2026-10-20 : un seul ton, cohérent avec la règle « une seule couleur de marque »), opacité ≤ 85 %, 9–12 px de haut, en tête et pied de page comme des seuils. Jamais porteuse d'information, jamais derrière du texte.
- **Glyphe pilier** — petit glyphe SVG inline (20–24 px) devant le nom du pilier, même langue graphique que la frise kabyle, monochrome sapin `{colors.action}` (clair) / `{colors.action-sombre}` (sombre) : **ⵣ Yaz** — sport · **tala** la fontaine — santé · **tabzimt** la fibule — citoyenneté · **ingel** le cèdre de l'Atlas — écologie. Discret : pas de médaillon, pas de carte, pas d'exposition ; signes sourcés (recherche amazigh), jamais de signification inventée.
- **Citation kabyle** — proverbe ancien (domaine public) en `{typography.body-lg}` italique, attribution « Sagesse kabyle » et source (Hanoteau 1867) en `{typography.meta}` ; uniquement aux points d'usage définis (EXPERIENCE.md → Voice and Tone) — jamais groupée en section, jamais sur la vitrine d'accueil, jamais en zone critique (scan, alertes, PC).
- **Bandeau égide** — fond `{colors.action}`, texte `{colors.action-texte}` en capitales espacées : « Sous l'égide de la Fédération et du ministère des Sports ». Toujours visible sur la vitrine.
- **Guide permission (iOS)** — écran étapes numérotées, chemin complet « Réglages > Azzel > Localisation > Toujours » en exergue `{colors.texte}`, bouton contour « Ouvrir les Réglages ».
- **Indicateur de fraîcheur** — `{typography.meta-lg}` `{colors.texte-2}` « synchronisé il y a X min », accolé à toute donnée live. Sombre : `{colors.texte-2-sombre}`.
- **Validation / refus de dossier** — panneau admin : pièces du dossier en checklist, refus = motif obligatoire en champ libre court ; jamais de refus silencieux.
- **Pédagogie batterie** — carte à puces courtes et concrètes (partir à 100 %, ne pas tuer l'application, powerbank), sans dramatiser.

## Do's and Don'ts

| Faire | Ne pas faire |
|---|---|
| L'effet « qui en jette » par dégradés, SVG inline et typographie display | Photos pleine largeur, carrousels d'images, webfonts chargées |
| Une seule couleur de marque (sapin / vert altitude) | Multiplier les accents décoratifs, dégradés arc-en-ciel |
| Opérationnelles jour J réservées à leur sémantique (scan, doublon, batterie, sync) | Danger sur un CTA, succès décoratif, attention comme punition |
| Contrastes AA+ dans les deux modes (≥ 4,5:1 courant, ≥ 3:1 grands textes) | Griser du texte critique, encre secondaire sur preuves à valider |
| Frises kabyles en seuils discrets, décoratives | Frises derrière du texte, en watermark pleine page, comme navigation |
| Visages de l'équipe, chiffres du village, citations d'habitants | Illustrations génériques de banque d'images, mascottes |
| Signes amazighs authentiques et sourcés : glyphes piliers discrets, frise, proverbes aux points d'usage avec source | Inventer une signification, détourner un symbole politique ou sacré, « Tafsut » comme label, exposer les signes en apparat |
| Mode sombre proposé partout, bascule utilisateur | Imposer un mode, ne pas tester les opérationnelles en sombre |
| Clignotements bornés ≤ 1 flash/s (période ≥ 1 s), toujours doublés du texte intégral | Stroboscope, flashs rapides non bornés, signal porté par le clignotement seul |
| Numéro de dossard en mono, heures en mono | Heures de classement en typo proportionnelle (chiffres qui bougent) |
| Mention d'égide toujours visible sur la vitrine | Enterrer la mention fédération/ministère |
| Vitrine < 300 Ko, rendu lisible < 5 s en 3G, GPX différé | Charger la carte avant le contenu, bloquer le rendu sur un script |
| Vidéo et galerie en lecture différée : poster léger, chargement au clic | Autoplay vidéo, galerie ou vidéo dans le chemin critique |

## Questions ouvertes

- Taille `display` mobile (cible 44–48 px) à figer sur écrans réels hétérogènes.
- Mécanisme exact de tailles système (dynamic type) sur l'app native — à arbitrer avec l'implémentation Expo.
- Si une fonte de marque chargée était exigée un jour, arbitrer contre le budget < 300 Ko.
