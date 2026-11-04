# Scénarios de recette — Épopée 9 : Refonte de la vitrine

**Produit :** Azzel · **Périmètre :** stories 9-1 → 9-6 · **Date :** 2026-11-04
**Durée estimée :** 45–60 min (module par module, arrêt/reprise possible)
**État courant du dépôt :** épopées 10 et 11 livrées par-dessus la 9 — la section parcours affiche les données du relevé d'essai (épopée 11) ; les écrans volontaires/admin ne sont pas décrits ici (recettes 3, 4, 5).

Cette recette couvre la vitrine telle qu'elle se teste **à l'écran**. Les parcours coureur complets (inscription, acceptations, preuve, checklist) et les recettes chronométriques ne sont PAS recopiés : voir les renvois en 9-4 et 9-5 vers les recettes réalignées des épopées 1, 2 et 7.

---

## 0. Préparation de l'environnement (5 min)

```bash
bash scripts/dev-db.sh up        # Postgres 54329 — crée/migre .env si besoin
bash scripts/dev-mail.sh up      # faux SMTP — UI http://localhost:8026
pnpm -F @azzel/web db:migrate    # toutes les migrations (0001 → 0034+)
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web   # http://localhost:3000
```

**Vérifications préalables :**
- [ ] `http://localhost:8026` répond (Mailpit)
- [ ] Accueil `localhost:3000` : photo de la ligne de départ en pleine largeur, titre géant « Week-end Sportif Aït Aïssi », mention « Plateforme Azzel » en pied de page
- [ ] Garde-fou anti-littéraux (story 9-1) : `pnpm -F @azzel/web exec vitest run src/app/css-sans-litteraux.test.ts` → 2 tests verts (aucune couleur codée en dur dans le CSS écrit à la main, hors exceptions épinglées avec raison)

---

## 9-1 — Socle de style partagé (story 9-1)

**Précondition :** environnement prêt, deux onglets : accueil et e-dossard (se connecter en coureur, ouvrir « Ton e-dossard » depuis la checklist).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Accueil, cliquer la bascule de thème (en-tête) puis recharger | Thème sombre appliqué et mémorisé, aucun flash au rechargement |
| 1.2 | Ouvrir l'e-dossard en thème clair | L'e-dossard reste sur son fond sombre propre (surface toujours sombre) : le thème global clair ne l'éclaircit pas |
| 1.3 | Repasser en thème sombre, recharger l'e-dossard | Rendu identique au 1.2 — aucune dérive entre les deux thèmes |
| 1.4 | Sur l'accueil, tabuler (clavier) à travers header, hero, pied de page | Anneau de focus visible sur chaque lien/bouton, y compris sur fond forêt du hero |
| 1.5 | Ouvrir `/resultats` : regarder chips, cartes et boutons | Cartes à coins arrondis (16 px), boutons/chips en pilule, cohérents entre eux |

- [ ] 9-1 conforme — Observations : …………

## 9-2 — Accueil refondu (story 9-2)

**Précondition :** accueil ouvert en desktop (fenêtre ≥ 960 px), les deux thèmes testés.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Regarder le hero | Photo de la ligne de départ 2026 conservée (coureurs rassemblés), voile sombre assurant la lisibilité, titre « Week-end Sportif **Aït Aïssi** » à très grande échelle (accent ocre sur « Aït Aïssi »), crête ocre sous le titre |
| 2.2 | Lire le rail de chiffres clés (à droite en desktop) | Exactement 4 entrées : **Date** « 2ᵉ édition — printemps 2027 » (date exacte non publique) · **Épreuves** « 35 km · 12 km » · **Départ** « Stade Agni Lhoudh » · **Cadre** « Forêt de Yakouren ». AUCUN D+, altitude ni nombre de places (chiffres non confirmés par le comité) |
| 2.3 | Chercher l'ancien bandeau de date et le badge d'épreuves | Absents — fondus dans le rail, pas de doublon d'information |
| 2.4 | Cliquer « S'inscrire » (hero) | Arrive sur `/connexion?parcours=inscription` |
| 2.5 | Survoler/activer « Appeler l'équipe » (hero) | Numéro de l'assistance (lien tel:), présent aussi dans la section contact plus bas |
| 2.6 | Rétrécir sous 960 px | Une colonne, ordre : titre → crête → rail → phrase méta → boutons ; le rail passe SOUS le titre, tout reste lisible sans défilement horizontal |
| 2.7 | Descendre à la bande « Bilan 2026 » | Bande horizontale sur fond forêt : **279** inscrits, **222** dossards distribués, **214** finishers « dont 36 femmes », bénévoles — valeurs 2026 exactes, inchangées |
| 2.8 | Basculer en thème sombre | Hero et bande bilan restent lisibles (texte clair sur forêt), aucun texte illisible |

- [ ] 9-2 conforme — Observations : …………

## 9-3 — Section parcours sur l'accueil (story 9-3)

**Précondition :** accueil ouvert, descendre à la section « Les parcours / Comparer les deux trails ». Les chiffres ci-dessous viennent du relevé d'essai publié (même source que la page `/parcours`).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | Regarder le sélecteur « Épreuve affichée » | Deux boutons chips : « La Longue » (actif par défaut) et « La Moyenne » |
| 3.2 | Cliquer « La Moyenne » PUIS « La Longue » | Le panneau de fiche bascule immédiatement, sans rechargement de page — la page n'utilise AUCUN JavaScript pour cette bascule |
| 3.3 | Panneau « La Longue — 35 km » | Fiche : Distance 28,0 km, Dénivelé positif 1 186 m, Dénivelé négatif 1 187 m, Altitude 221,6–835,7 m ; mention « **Tracé provisoire**, issu d'un relevé d'essai : distance, dénivelé et profil pourront évoluer. » ; lien « Télécharger le tracé GPX » (fichier .gpx) |
| 3.4 | Points de passage de la longue | Liste : Départ (km 0, 677 m) et Arrivée (km 28,0, 676 m) — kilométrages dans le référentiel de CETTE épreuve |
| 3.5 | Aside « Le relief de l'épreuve », longue active | Profil altimétrique dessiné ; au glisser/doigt, un curseur lit distance et altitude sans capturer le défilement vertical de la page |
| 3.6 | Basculer sur « La Moyenne » | Fiche : « La Moyenne — 12 km », distance 12 km et RIEN d'autre — aucun D+, aucune altitude, aucune mention « tracé provisoire » (pas de tracé fourni) |
| 3.7 | Aside viz, moyenne active | Annonce utile : « La carte en relief et le profil altimétrique seront publiés avec le tracé officiel… » — jamais un cadre vide |
| 3.8 | Désactiver JavaScript (DevTools), recharger, cliquer les chips | La bascule fonctionne encore (radios natifs) ; à défaut de bascule, les deux fiches restent lisibles empilées |
| 3.9 | Navigation clavier sur le sélecteur | Tab atteint les chips (cibles ≥ 44 px), les flèches gauche/droite changent d'épreuve, l'épreuve active se lit par le fond plein du chip et le titre h3 du panneau |
| 3.10 | Suivre « Voir le détail des parcours » | Page `/parcours` avec les mêmes fiches détaillées |

- [ ] 9-3 conforme — Observations : …………

## 9-4 — Parcours de dossier refondu : fil d'étapes, formulaires, checklist (story 9-4)

**Le parcours fonctionnel complet n'est pas recopié ici :** suivre la **recette épopée 1** (`scenarios-recette-epic-1.md`), réalignée le 2026-11-03 — pas S3.7 (fil sur /inscription), S4.5 (fil sur /acceptations), S5.5–5.7 (preuve, fil sur /preuve) et S7 (checklist). La logique métier (validation, clôture J-10, compression, horodatage serveur) est inchangée et reste couverte par ces modules.

Compléments propres à la refonte 9-4 :

**Précondition :** un coureur connecté, dossier en cours (voir recette épopée 1).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | `/inscription` : lire le fil « Étapes du dossier » | Quatre étapes : Inscription, Documents, Paiement, Validation. La courante = disque plein à double filet + « Étape 1 sur 4 — en cours » ; les suivantes = disques creux numérotés, SANS mention d'état et SANS lien |
| 4.2 | Coureur ayant DÉJÀ les deux acceptations (décharge + règlement), rouvrir `/inscription` | Étape Documents : disque coché ✓ + « Fait », et **lien de retour cliquable** vers `/acceptations` (correctif revue 9) |
| 4.3 | Parcourir le formulaire (identité → urgence → t-shirt) | Champs au gabarit du socle ; chaque obligatoire annoncé par « (obligatoire) » en texte — AUCUN astérisque ; en erreur, le message nomme le champ |
| 4.4 | Rétrécir sous 960 px, puis repasser en desktop | Téléphone : une colonne, récapitulatif SOUS le formulaire ; desktop ≥ 960 px : récapitulatif en colonne latérale à droite |
| 4.5 | `/preuve` : lire l'aide du champ fichier | « Formats acceptés : JPEG, PNG, WebP ou PDF. Aucun autre format n'est accepté. » — le plafond de 300 Ko est annoncé UNE seule fois, dans l'intro au-dessus (correctif revue 9 : l'aide du champ ne le répète plus) |
| 4.6 | Espace coureur : lire la checklist | Puce « à faire » = anneau creux ; « Fait » = disque plein vert ; chaque action = pilule pleine ≥ 44 px ; texte d'état (« Fait » / « À faire ») toujours porteur du sens |

- [ ] 9-4 conforme — Observations : …………

## 9-5 — Résultats publics refondus (story 9-5)

**Le scénario chronométrique complet (départs, arrivées, abandons, écrans terrain) n'est pas recopié :** suivre la **recette épopée 7** (`scenarios-recette-epic-7.md`), réalignée le 2026-11-03. La page publique `/resultats` se teste sans course active ou avec la démo chrono (voir épopée 7).

**Précondition :** `/resultats` ouvert ; idéalement des partants et arrivées en base (recette épopée 7, modules chrono).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 5.1 | Regarder l'en-tête | Témoin « Résultats en direct » (point pulsé) + âge de synchronisation ; jamais « officiel », jamais « temps réel » — le libellé est « Classement provisoire » |
| 5.2 | Anonymat | Partout sur la page : UNIQUEMENT des numéros de dossard — aucun nom, prénom, email ni photo |
| 5.3 | Champ « Dossard » : saisir « 2 » | La recherche porte sur le NUMÉRO de dossard uniquement (jamais de recherche par nom) ; le tableau et « Derniers arrivés » se filtrent en direct |
| 5.4 | Saisir « 2a1b » dans le champ | Seuls les chiffres sont retenus (affiché « 21 ») — la saisie non numérique ne reste jamais sans effet (correctif revue 9) ; le bouton « Effacer les filtres » apparaît dès qu'un filtre est actif |
| 5.5 | Sélecteur « Épreuve » | Une option par épreuve ; le choix isole la section correspondante |
| 5.6 | Sélecteur « Catégorie » | Seules les catégories présentes dans des épreuves CONFIGURÉES (avec heure de départ) sont proposées (correctif revue 9) ; le choix filtre les lignes du tableau, PAS « Derniers arrivés » |
| 5.7 | Sans filtre, regarder chaque épreuve | Podium « Premiers arrivés » (rang en toutes lettres : 1ᵉʳ, 2ᵉ…) AU-DESSUS du tableau ; ex æquo éventuels affichés tels que servis (deux « 1ᵉʳ » possibles) |
| 5.8 | Activer N'IMPORTE QUEL filtre (dossard, épreuve ou catégorie) | Le podium DISPARAÎT (un podium filtré serait un recalcul de classement, interdit) ; le tableau reste |
| 5.9 | Rétrécir à ~360 px | Le tableau défile dans SA zone (conteneur focusable), jamais la page entière ; podium : une carte par ligne ; l'épreuve qualifie chaque dossard de « Derniers arrivés » |
| 5.10 | Recherche sans correspondance | « Aucun dossard ne correspond à cette recherche. » dans les classements ; un dossard d'épreuve sans heure configurée reste visible dans « Derniers arrivés » (comportement conservé, revue 9) |
| 5.11 | Aucun partant (course non démarrée) | « Pas encore de partants — départ à HH:MM » (heure locale) ou texte neutre sans heure configurée ; AUCUN formulaire de recherche — rien à chercher |

- [ ] 9-5 conforme — Observations : …………

## 9-6 — Non-régression mesurée de la vitrine (story 9-6)

Story de vérification : l'essentiel est automatisé. Contrôles humains de complément :

| # | Action | Résultat attendu |
|---|--------|------------------|
| 6.1 | `pnpm typecheck` puis `pnpm test` puis `pnpm budget` | Tous verts ; budget du chemin critique ≤ 300 Kio (voir le nombre affiché, il doit rester sous le seuil) |
| 6.2 | `/resultats`, zoom 200 % (Ctrl/Cmd +) | Pas de défilement horizontal de la PAGE ; seul le tableau défile dans sa zone |
| 6.3 | Accueil : survol/touch des liens texte (« Voir le détail des parcours », GPX…) | Cibles pleines ≥ 44 px de haut (correctif 9-6), confortables au doigt |
| 6.4 | Système : activer « Réduire les animations », recharger accueil et résultats | Aucune animation intrusive (point « direct » et squelettes figés) |
| 6.5 | Tabuler depuis le haut de l'accueil et de /resultats | Un lien « Aller au contenu » apparaît à la première tabulation ; le focus est toujours visible |

**Non-corrigés (mesurés, antérieurs à l'épopée 9, consignés au travail différé) :** débordement résiduel à 200 % sur les vieilles surfaces (en-tête, onglet « Mon trail »), liens de pied de page < 44 px. Ne pas les compter comme écarts de la présente recette.

- [ ] 9-6 conforme — Observations : …………

---

## Transverse (tous modules)

- [ ] Navigation mobile (360 px) : aucune barre de défilement horizontal hors zones prévues, cibles ≥ 44 px
- [ ] Les deux thèmes : aucun texte illisible, aucun flash au rechargement
- [ ] Aucun caractère parasite (carrés, sinogrammes) dans les textes affichés

## Tableau de synthèse

| Module | Statut (OK / Écart) | Observations |
|--------|--------------------|--------------|
| 9-1 Socle de style & tokens | | |
| 9-2 Accueil refondu | | |
| 9-3 Section parcours | | |
| 9-4 Parcours de dossier (renvoi épopée 1 + compléments) | | |
| 9-5 Résultats publics (renvoi épopée 7 + compléments) | | |
| 9-6 Non-régression mesurée | | |
