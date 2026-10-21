Charte graphique du **Week-end Sportif Aït Aïssi**, événement sportif et citoyen organisé chaque année au stade Agni Lhoudh, village d'Aït Aïssi (commune de Yakouren, wilaya de Tizi Ouzou, Kabylie). Signature : **Sport, Santé et Citoyenneté**. Elle sert de référence pour le site web de l'événement et pour tous les supports (dossier de sponsoring, affiches, réseaux sociaux).

Trois valeurs guident chaque choix : **sérieux, ambition, authenticité**. Le site doit montrer un événement bien organisé, qui grandit, et qui reste porté par un village.

## Ton et rédaction

- Écrire en **français**, phrases courtes, à la voix active. Vouvoyer le visiteur (« Inscrivez-vous », « Devenez partenaire »).
- Parler concret : distances, horaires, lieux, disciplines. Exemple : « Trail de 23 km et 825 m de dénivelé positif à travers la forêt. »
- Distinguer toujours le **réalisé** (2026) du **prévu** (2027). Un objectif s'écrit comme un objectif : « Objectif : 600 inscrits au trail », jamais « 600 inscrits ».
- Ne jamais inventer de chiffres (audience, visiteurs, retombées). Les chiffres 2026 officiels : 279 inscrits, 222 dossards, 214 finishers dont 36 femmes au trail ; 116 enfants à la Course Kids ; 40 en handball, 22 en karaté et Vovinam, 20 en boxe, environ 20 en cyclisme, 18 aux échecs, 18 en gymnastique. Ne pas les additionner.
- Pas d'émojis dans les textes du site.
- Capitales pour les titres (police `display`), casse normale pour le texte courant.

## Logo

Le logo associe un **symbole** (deux sommets vert forêt et un sentier ocre, fourni par le comité) au nom de l'événement en Barlow Condensed. Tous les fichiers sont dans le groupe d'assets **Logos**, en SVG vectorisé (aucune police nécessaire).

- Utiliser `aitaissi-logo.svg` sur fond clair (`surface`, `surface-raised`) et `aitaissi-logo-negatif.svg` sur `forest-surface` ou sur une photo assombrie.
- En-tête du site : logo complet, 40px de haut sur desktop, 32px sur mobile. Sous 160px de large, utiliser le symbole seul (`aitaissi-symbole.svg`).
- **Favicon et icône d'application** : le symbole seul sur fond `cream` ou `forest`.
- **Zone de protection** : laisser autour du logo un vide égal à la moitié de la hauteur du symbole.
- `aitaissi-badge.svg` : version ronde pour avatars de réseaux sociaux, médailles, textile.
- Ne pas déformer, recolorer (hors versions mono fournies), ajouter d'ombre, ni poser le logo couleur sur une photo non assombrie.

## Couleurs

La palette vient du lieu : le vert de la forêt de Yakouren, l'ocre de la terre du stade Agni Lhoudh, le blanc cassé et l'anthracite.

- Fond de page : `surface`. Cartes et tableaux : `surface-raised`. Grands aplats de marque (hero sans photo, bandeau partenaires, pied de page) : `forest-surface` avec du texte `on-forest`.
- Texte courant : `ink`. Texte secondaire : `ink-muted`. Titres : `heading`.
- **Ocre** : réservé aux accents. `highlight` pour les grands chiffres (24px et plus), `accent` pour les liens et sur-titres, `action` pour le bouton principal. Ne jamais composer un paragraphe en ocre.
- `sage`, `forest-400` et `sand` servent aux graphiques et filets, jamais au texte.
- Proportions indicatives : 60 % crème, 30 % vert forêt, 10 % ocre.
- Pas de dégradés décoratifs. Seule exception : un voile `forest` sur une photo pour garantir la lisibilité du texte posé dessus.
- Le site propose un thème sombre (valeurs `dark` des tokens). Il reste optionnel : le thème clair est la référence.

## Typographie

- **Barlow Condensed** (`--font-display`) pour les titres, chiffres et libellés, en CAPITALES : styles `stat`, `display-xl`, `h1`, `h2`, `h3`, `eyebrow`.
- **Inter** (`--font-body`) pour le texte : styles `lead`, `body`, `small`, `label`.
- Les fichiers woff2 (sous-ensemble latin, accents français inclus) sont dans `fonts/`. Les deux polices sont aussi disponibles sur Google Fonts.
- Un titre de section est toujours précédé d'un `eyebrow` en `accent` (ex. « BILAN 2026 » puis « UNE PREMIÈRE ÉDITION RÉUSSIE »).
- Les grands chiffres utilisent `stat` en `highlight`, avec un `label` dessous. Activer `font-variant-numeric: tabular-nums` dans les tableaux.
- Paragraphes limités à `text-max` (68 caractères).

## Photographie

Les photos réelles de l'édition 2026 sont dans le groupe d'assets **Photos 2026**. Elles sont la matière principale du site.

- Toujours des photos réelles de l'événement ; jamais de banque d'images ni d'images générées présentées comme l'événement.
- Privilégier l'émotion et la foule : arrivées, départs, public, bénévoles, familles.
- Photo d'accueil conseillée : `aitaissi-2026-celebration-montagne.jpg`.
- Recadrer avec `object-fit: cover`, sans déformer. Pas de filtre ni de retouche lourde.
- Texte sur photo : ajouter un voile `forest` (opacité 60 à 85 %) du côté du texte, texte `on-forest`.
- **Mineurs** : `aitaissi-2026-enfants-ring-boxe.jpg` montre des enfants identifiables ; ne la publier qu'avec l'accord du comité et des parents.
- Les fichiers fournis font 2048px de large : servir des versions WebP redimensionnées (640, 1280, 2048px) avec `srcset`.

## Mise en page web

- Conteneur centré, largeur max `container-max`. Marges latérales : `space-4` sur mobile, `space-8` sur tablette, `space-16` au-delà de `bp-lg`.
- Sections espacées verticalement de `space-24` (desktop) / `space-12` (mobile). Alterner fond `surface` et fond `forest-surface` pour rythmer la page.
- Grilles de cartes : 1 colonne sous `bp-sm`, 2 colonnes jusqu'à `bp-md`, 3 au-delà ; écart `space-6`.
- Rayons : `radius-md` pour boutons et cartes, `radius-sm` pour chips. Une seule ombre, `shadow-card`.
- Filet décoratif possible : une ligne de crête en `ochre`, 1,5px, sous un bloc titre ou en bas du hero.
- Mobile d'abord : toute la page fonctionne à 360px de large, sans défilement horizontal.

## Arborescence conseillée du site

1. **Accueil** : hero photo, dates, bouton « S'inscrire » et « Devenir partenaire », chiffres 2026, aperçu des disciplines.
2. **Le week-end** : présentation, valeurs, lieu (stade Agni Lhoudh, forêt de Yakouren), programme par jour.
3. **Disciplines** : trail (épreuve phare), course adultes 10 km (envisagée), Course Kids et disciplines du stade.
4. **Inscriptions** : formulaire en ligne, tarifs, règlement.
5. **Partenaires** : logos des partenaires, formules, lien vers le dossier de sponsoring (PDF).
6. **Retour en images** : galerie 2026.
7. **Contact** : coordonnées, réseaux sociaux, accès.

Dates 2027, distance du trail 2027, tarifs d'inscription, coordonnées et réseaux sociaux : **à confirmer par le comité** avant la mise en ligne.

## Composants

Les composants de base sont décrits dans la section Composants avec un aperçu et du HTML/CSS prêts à reprendre (classes préfixées `aa-`, styles dans `components/bundle.css`) : `SiteHeader`, `Hero`, `Button`, `SectionHeader`, `StatTile`, `Card`, `Chip`.

## Iconographie

La charte ne comprend pas de jeu d'icônes propre. Le texte prime. Si des pictogrammes sont nécessaires (programme, accès, contact), utiliser un jeu linéaire unique, trait 1,5-2px, couleur `heading` ou `accent`, par exemple Lucide (recommandation, à valider).

## Accessibilité

- Contrastes : `ink`, `ink-muted`, `accent` et `on-action` atteignent au moins 4,5:1 sur leurs fonds dans les deux thèmes. `highlight` / `ochre` n'atteignent que 3:1 sur `surface` : réservés aux textes de 24px et plus.
- Focus clavier visible partout : anneau `focus` de 2px, décalé de 2px.
- Textes alternatifs descriptifs sur toutes les photos (« Coureurs au départ du trail, 2026 »).
- Respecter `prefers-reduced-motion` : pas d'animation automatique au-delà d'un fondu.
