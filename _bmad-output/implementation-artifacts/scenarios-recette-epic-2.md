# Scénarios de recette — Épopée 2 : Vitrine publique de l'édition

**Produit :** Azzel · **Périmètre :** stories 2-1 → 2-5 · **Date :** 2026-10-22
**Durée estimée :** 45–60 min. Prérequis identiques à l'épopée 1 (§0 de scenarios-recette-epic-1.md) : `dev-db.sh up`, `dev-mail.sh up`, `db:migrate`, `AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web`.
**Réaligné story 9-6 (2026-11-03) :** accueil refondu (stories 9-2/9-3) — hero plein écran à rail de chiffres, section parcours avec sélecteur d'épreuve. Modules S3, S4 et S5 inchangés.

**Budget à vérifier en premier :** `pnpm build && pnpm budget` → **< 300 Ko** (garde-fou automatisé, aussi en CI).

---

## S1 — Page d'annonce (story 2-1)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Ouvrir `/` (cache vidé, DevTools Network) | Hero plein écran : photo du départ 2026 sous voile forêt, titre « Week-end Sportif Aït Aïssi » avec un rail de chiffres clés à sa droite (sous le titre en mobile) ; texte lisible immédiatement, total < 300 Ko (onglet Network, colonne transféré) |
| 1.2 | Throttling « Slow 3G » + rechargement | Titre/CTA lisibles avant l'arrivée de la photo ; aucune page blanche |
| 1.3 | Bandeau égide | « Sous l'égide de la Fédération et du ministère des Sports » visible sur TOUTES les pages (accuei /connexion, /parcours…) |
| 1.4 | Bande forêt « Bilan 2026 » (juste sous le hero) | Rail de 4 chiffres : 279 inscrits, 222 dossards distribués, 214 finishers au trail dont 36 femmes, 116 enfants à la Course Kids — chiffres exacts, non additionnés, note « Chiffres officiels de l'édition 2026 » |
| 1.5 | CTA « S'inscrire » | Mène à /connexion?parcours=inscription (écran « Créer mon compte ») ; bouton « Appeler l'équipe » visible avec numéro |
| 1.6 | JS désactivé | Contenu complet lisible (page serveur) |
| 1.7 | 360 px | Une colonne, symbole seul dans l'en-tête, aucun scroll horizontal |
| 1.8 | Lire la fiche de clés du hero (carte vitrée) | Quatre clés, la date en vedette : **Date** — « 2ᵉ édition » en petit puis « Printemps 2027 » en grand, crête ocre dessous ; puis sur une rangée Épreuves « 35 km · 12 km », Départ « Stade Agni Lhoudh », Cadre « Forêt de Yakouren ». Aucune date exacte, ni dénivelé, ni altitude, ni horaires |
| 1.8bis | Descendre à « Bilan 2026 » | Sous les chiffres, un bloc « Le teaser de la première édition » : poster vert avec pastille de lecture et la mention « La vidéo se charge uniquement quand vous cliquez ». Cliquer : la vidéo YouTube se monte et démarre. Avant le clic, aucune requête vers YouTube (onglet Réseau) |
| 1.9 | Descendre à la section « Les parcours » (titre « Comparer les deux trails ») | Section placée après les photos de la section épreuves : deux boutons d'épreuve (« La Longue », « La Moyenne ») ; « La Longue » affichée par défaut, sa fiche montre la Distance (35 km) et le lien « Télécharger le tracé GPX » |
| 1.10 | Cliquer le bouton « La Moyenne » | La fiche devient celle de La Moyenne (Distance 12 km, son propre lien GPX) sans rechargement de page ; recliquer « La Longue » réaffiche la première fiche |
| 1.11 | Désactiver JavaScript puis recharger `/` | Le sélecteur fonctionne toujours : cocher une épreuve affiche sa fiche (mécanisme natif sans script), la section reste lisible |
| 1.12 | Chercher « Dénivelé », « Altitude », « Heure de départ » ou « Points de passage » dans la section parcours | Aucune de ces lignes n'apparaît : tant que le comité n'a pas publié les données, les fiches n'affichent que nom, distance et lien GPX |

## S2 — Identité Village (story 2-2)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Section piliers | 4 cartes : Sport (ⵣ), Santé (fontaine), Citoyenneté (fibule), Écologie (cèdre) — glyphes filaires sobres, aucun médaillon |
| 2.2 | Frises | Bandeau géométrique discret en tête et pied de la vitrine ; ligne de crête ocre sous le titre du hero |
| 2.3 | Ctrl+F « Tafsut » | Aucune occurrence nulle part |
| 2.4 | Thème sombre | Piliers/frises revalorisés, aucun texte illisible (eyebrow « Contact » reste lisible) |
| 2.5 | `pnpm test` contient contrastes | Vérifié par les tests (AA deux thèmes) — visuel de contrôle à l'œil |

## S3 — Sponsors A/B (story 2-3)

**Précondition :** connecté en `orga@example.dz` → lien « Administration ».

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | `/admin/sponsors` vide | Page propre, aucune section vide côté accueil |
| 3.2 | Ajouter « Ifri » + cocher signature, mode A | Accueil : bande forêt, nom en capitales, « Partenaire signature » (lien si URL) |
| 3.3 | Bascule en mode B + ajouter 2 sponsors | Rechargement accueil : grille de 3 emplacements équivalents — SANS redéploiement |
| 3.4 | Retour en mode A | Le sponsor signature réapparaît (flag conservé) |
| 3.5 | Supprimer un sponsor | Confirmation demandée, puis disparu |
| 3.6 | Saisir http:// (non https) en logo | Refusé ou hint https affiché ; nom sans URL invalide accepté |
| 3.7 | En coureur (`coureur@example.dz`) : `/admin/sponsors` | Refusé (403/redirection) |

## S4 — Parcours & région (story 2-4)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | `/parcours` | Longue 35 km + Moyenne 12 km, contenus balisés « à confirmer par le comité » visibles |
| 4.2 | Citation | « Aman d laman » UNIQUEMENT dans le contexte ravitaillements, avec « Sagesse kabyle (Hanoteau, 1867) » — nulle part ailleurs |
| 4.3 | GPX | Bouton/section révélée au clic seulement ; sans URL : « Tracé à venir », jamais de lien mort |
| 4.4 | `/region` | Consigne « ne pas défier la montagne », note singes sacrés du Jurjura, hébergement/restauration/annexes |
| 4.5 | `/admin/contenus` : modifier « Hébergement » | Rechargement /region → nouveau texte (sans dev) |
| 4.6 | Insérer `<script>alert(1)</script>` dans un bloc | Affiché comme texte simple, rien d'exécuté |
| 4.7 | Éditer le même bloc depuis deux fenêtres admin | Le second enregistrement reçoit « Recharge la page » (conflit 409) |

## S5 — Trailer & témoignages (story 2-5, Should)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 5.1 | `/retour-en-images` SANS matière | Intro + galerie 2026 seulement — aucun bloc vide, aucune promesse |
| 5.2 | Admin : coller une URL YouTube, ajouter 2 témoignages | Page : poster dégradé + pastille lecture, témoignages en cartes (initiales + édition) |
| 5.3 | DevTools Network AVANT le clic | Aucun trafic vidéo ; APRÈS le clic : la vidéo se charge ET démarre |
| 5.4 | URL non affichable (ex. playlist) | Avertissement immédiat côté admin à l'enregistrement |
| 5.5 | 7ᵉ témoignage | Refusé (max 6) |
| 5.6 | Lien « Retour en images » | Présent dans le pied de page de l'accueil ; `pnpm budget` reste vert |

## Transverse

- [ ] Toutes les pages publiques au vouvoiement ; espace coureur toujours tutoiement
- [ ] Thème sombre sur toutes les nouvelles pages ; bascule mémorisée
- [ ] Focus clavier visible partout ; navigation au clavier possible sur /parcours et /region
- [ ] 360 px : /parcours, /region, /retour-en-images sans scroll horizontal

## Tableau de synthèse

| Module | Statut (OK / Écart) | Observations |
|--------|--------------------|--------------|
| S1 Annonce & budget | | |
| S2 Identité Village | | |
| S3 Sponsors A/B | | |
| S4 Parcours & région | | |
| S5 Trailer & témoignages | | |
| Transverse | | |
