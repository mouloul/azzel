# Scénarios de recette — Épopée 7 : La course visible de l'extérieur

**Produit :** Azzel · **Périmètre :** stories 7-1 → 7-4 · **Date :** 2026-10-24
**Durée estimée :** 70–90 min (module par module, arrêt/reprise possible)
**Réaligné story 9-6 (2026-11-03) :** page /resultats refondu (story 9-5) — recherche par dossard, filtres épreuve/catégorie, podium des premiers arrivés. Libellés (« Classement provisoire », « synchronisé il y a X ») et états vides vérifiés inchangés. Modules S1, S3 et S4 inchangés.

Chaque module se teste indépendamment. Prérequis : recettes épopées 1 à 6 terminées (coureurs validés/numérotés, e-dossards consultés, scans volontaires opérationnels, app coureurs avec suivi activable).

---

## 0. Préparation de l'environnement (10 min)

```bash
bash scripts/dev-db.sh up        # Postgres 54329
bash scripts/dev-mail.sh up      # Mailpit — http://localhost:8026
pnpm -F @azzel/web db:migrate    # 0001–0034
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web   # http://localhost:3000
```

**Prérequis données :**
- [ ] 3–4 coureurs VALIDÉS et NUMÉROTÉS, dont 2 avec l'e-dossard consulté (jeton connu pour les scans) — recette 1
- [ ] Un volontaire avec missions **retrait** + **scan checkpoint** (dont UNE cochée « Checkpoint d'arrivée ») — recettes 3/4
- [ ] Positions GPS possibles : app coureurs avec suivi activé (recette 6) OU insertion directe via la sync (`POST /api/coureur/tracking/sync`)
- [ ] `epreuve.gpx_url` renseignée pour au moins une épreuve (URL d'un GPX public valide) — `/admin/contenus`

---

## S1 — Classements et heures de départ (story 7.1)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | `/admin/course` → carte « Heures de départ » | Une ligne par épreuve (nom, distance, champ datetime-local), bouton Enregistrer |
| 1.2 | Définir Longue 08:00, Moyenne 08:30 → Enregistrer | Heures sauvées, réaffichées en heure locale ; volontaire (session volontaire) → carte protégée |
| 1.3 | Vider une heure → Enregistrer | Heure effacée (null) sans erreur |
| 1.4 | Scans volontaires : retrait de 201/202 (Longue) et 301 (Moyenne), puis passages ARRIVÉE à des heures arbitraires | — |
| 1.5 | `psql` : `select epreuve.nom, c.dossard from coureur c join epreuve e on e.id=c.epreuve_id` | Coureurs bien répartis par épreuve |
| 1.6 | Vérifier les classements (S2 les affiche) | Longue : rangs par temps réels (08:00 → t1), Moyenne séparée (08:30 → t2) ; un coureur n'apparaît QUE dans sa course |
| 1.7 | Saisir un ABANDON (recette 5.3) pour un arrivé tardif | L'abandonné n'est JAMAIS rangé, listé à part |
| 1.8 | Annuler (5.4) le premier passage arrivée d'un coureur qui en a un second | Le SECOND fait foi : rang recalculé |
| 1.9 | Scan de DÉPART (mission scan départ) horodaté n'importe comment | Aucun effet sur les temps (AD-3) |

## S2 — Résultats en direct partageables (story 7.2)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Visiteur anonyme → `/resultats` (lien « Résultats » en pied de page) | « Résultats en direct », « Classement provisoire » EN TOUTES LETTRES + « synchronisé il y a X min » — jamais « officiel », jamais « temps réel » |
| 2.3 | État vide (avant tout retrait) | « Pas encore de partants — départ à HH:MM » (prochaine heure de départ) ; sans heure : texte neutre, JAMAIS 00:00 |
| 2.4 | Synchroniser un scan (téléphone volontaire) | Classements + « Derniers arrivés » (dossard mono + épreuve + temps) mis à jour ≤ 10 s SANS rechargement |
| 2.5 | DevTools → Offline sur l'onglet ouvert | Dernier état CONSERVÉ, « reconnexion… » discret ; Online → ça repart |
| 2.6 | Copier `/resultats?partage=1` et l'ouvrir 3× | Page normale ; `psql : select visites from resultats_visite` → 3 visites du jour (aucune IP/UA en base) |
| 2.7 | Ouvrir `/resultats` SANS paramètre + laisser le polling tourner | Aucun comptage supplémentaire |
| 2.8 | `GET /api/resultats` direct | JSON {ok, resultats} no-store — aucune donnée personnelle (dossards seuls) |
| 2.9 | Bloc « Retrouver un coureur » : saisir un dossard présent au classement (ex. 201) | Le classement ET la liste « Derniers arrivés » ne montrent plus que ce dossard, sans rechargement ; le bouton « Effacer les filtres » apparaît ; un dossard inconnu n'affiche aucune ligne, jamais une erreur |
| 2.10 | Filtre « Épreuve » : choisir La Longue | Seule la carte de La Longue reste (titre « La Longue — 35 km », méta « 35 km — départ à 08:00 » si l'heure est définie) ; « Toutes » réaffiche les deux épreuves ; sur téléphone, le tableau défile dans sa propre zone, le reste de la page ne défile pas horizontalement |
| 2.11 | Filtre « Catégorie » : choisir une catégorie présente | Le tableau de chaque épreuve n'affiche que cette catégorie ; les trois critères se combinent (dossard + épreuve + catégorie) ; « Effacer les filtres » restaure la vue complète |
| 2.12 | Avec des arrivés en base : regarder le podium au-dessus du tableau de chaque épreuve | Bloc « Premiers arrivés » : rang en toutes lettres (1ᵉʳ, 2ᵉ, 3ᵉ), badge dossard, temps — les rangs ex æquo sont servis tels quels (deux « 1ᵉʳ » possibles), aucun recalcul |
| 2.13 | Activer la recherche ou un filtre alors que le podium est visible | Le podium disparaît (un podium dérivé d'un filtre serait trompeur) ; il revient à l'effacement des filtres |

## S3 — Carte publique anonyme (story 7.3)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | `/resultats` → DevTools Network puis recharger | AUCUNE requête leaflet/tuile au chargement initial (section carte fermée) |
| 3.2 | Cliquer « Afficher la carte » | La carte charge ALORS (tracés GPX par épreuve, pastilles dossard couleur d'action) ; attribution OpenStreetMap visible |
| 3.3 | Positions récentes (< 1 h) via l'app coureurs ou la sync | Pastille mise à jour ≤ 10 s (carte ouverte) |
| 3.4 | Position de plus d'1 h | Pastille ESTOMPÉE + « dernière position connue il y a X » — jamais supprimée, jamais alarmiste |
| 3.5 | Un coureur avec 2 appareils (téléphone + montre) | UNE SEULE pastille (la plus récente) |
| 3.6 | Aucune position partagée | Message doux « les résultats racontent la course » — les tracés restent |
| 3.7 | « Masquer la carte » | Carte fermée, polling suspendu ; réouverture propre |
| 3.8 | `gpx_url` cassée (404) sur une épreuve | Cette épreuve sans tracé, les autres servies — aucune erreur brute |
| 3.9 | Clavier/lecteur d'écran | Liste texte des positions (dossard + épreuve + dernière position connue) lisible |
| 3.10 | `pnpm budget` | /resultats sans chunk carto dans le HTML initial (garde automatisée) |

## S4 — Rapports post-course et export « commande » (story 7.4)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | `/admin/rapports` (liens depuis `/admin/course` et `/admin/dossiers`) | Deux cartes descriptives + boutons de téléchargement + note J-10 dérivée de la date de course |
| 4.2 | Télécharger « Rapport post-course » | CSV unique à sections : synthèse (inscrits par statut, retraits, partants/arrivées/abandons par épreuve), passages par checkpoint, arrivées (rang + temps), abandons détaillés (lieu, motif, heure, auteur), portée des partages — s'ouvre proprement dans Excel FR (BOM) |
| 4.3 | Ligne « Généré le … » en tête du CSV | Date/heure + fraîcheur des données |
| 4.4 | Vérifier cohérence | Retraits ≤ Σ partants ; abandons de la recette 1.7 présents ; visites de S2.6 dans « portée des partages » |
| 4.5 | Télécharger « Commande » (J-10) | Validés par épreuve × taille (XS–XXL), totaux t-shirts, médailles = 1 par validé par épreuve, mention « zéro stock » — RIEN pour les non-validés |
| 4.6 | Session volontaire → `GET /api/admin/rapports/commande` | 403, AUCUN octet de CSV |
| 4.7 | Édition sans données (base de test vide) | Sections à zéros lisibles, pas de crash |
| 4.8 | Cellule lieu d'abandon = `=SOMME(A1)` | Préfixée `'` dans le CSV — Excel n'exécute rien |

---

## Synthèse

| Module | Statut | Observations |
|--------|--------|--------------|
| S1 Classements + heures | ☐ | Vérifier ex æquo (1,1,3) et AD-3 (scan départ sans effet) |
| S2 Résultats partageables | ☐ | Fraîcheur affichée, anonymat (dossards seuls), comptage ?partage=1 |
| S3 Carte anonyme | ☐ | Pare-chemin-critique (aucune tuile avant clic), estompage > 1 h |
| S4 Rapports + commande | ☐ | CSV Excel FR, abandonnés inclus, commande validés uniquement |
