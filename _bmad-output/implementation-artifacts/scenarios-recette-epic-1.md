# Scénarios de recette — Épopée 1 : S'inscrire et boucler son dossier

**Produit :** Azzel · **Périmètre :** stories 1-1 → 1-9 · **Date :** 2026-10-21
**Durée estimée :** 60–90 min (module par module, arrêt/reprise possible)
**Réaligné story 9-6 (2026-11-03) :** parcours de dossier refondu (story 9-4) — fil d'étapes « Étapes du dossier » sur /inscription, /acceptations et /preuve ; libellés de la checklist vérifiés inchangés. Modules S1, S2, S6, S8 et S9 inchangés.

Chaque module se teste indépendamment : cochez au fur et à mesure et notez les écarts dans la colonne Observations du tableau final.

---

## 0. Préparation de l'environnement (5 min)

```bash
bash scripts/dev-db.sh up        # Postgres 54329 — crée/migre .env si besoin
bash scripts/dev-mail.sh up      # faux SMTP — UI http://localhost:8026
pnpm -F @azzel/web db:migrate    # 0001–0009
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web   # http://localhost:3000
```

**Vérifications préalables :**
- [ ] `http://localhost:8026` répond (boîte Mailpit vide ou quasi)
- [ ] Page d'accueil `localhost:3000` : logo Aït Aïssi en en-tête, fond crème, titres Barlow en capitales, mention « Plateforme Azzel » en pied
- [ ] Onglet navigateur : favicon = symbole Aït Aïssi

**Deux comptes de test :**
- Coureur : `coureur@example.dz` (tout le parcours)
- Organisateur : `orga@example.dz` (via `AZZEL_ADMIN_EMAILS` ci-dessus)

**Astuce :** sans SMTP configuré le code s'affiche dans les logs du serveur dev ; avec Mailpit il arrive dans la boîte (colonne « To ») — plus confortable.

---

## S1 — Fondation & thème (story 1-1)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Ouvrir l'accueil | Thème clair par défaut, aucun flash au rechargement |
| 1.2 | Cliquer la bascule « Passer en thème sombre » (en-tête) | Fond vert-noir forêt, logo passe en négatif |
| 1.3 | Recharger la page | Le thème sombre est mémorisé (pas de flash) |
| 1.4 | Vider le localStorage (DevTools → Application → azzel-theme) puis recharger | Retour au thème clair |
| 1.5 | Rétrécir la fenêtre sous 480 px | Symbole seul dans l'en-tête, aucune déformation |
| 1.6 | Navigation clavier (Tab) sur l'accueil | Anneau de focus visible sur chaque lien/bouton |

- [ ] S1 conforme

## S2 — Connexion email + code, session unique (story 1-2)

**Précondition :** navigation privée (fenêtre A) pour partir d'un état propre.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | `/connexion` — saisir `coureur@example.dz`, valider | Étape code : champ numérique 6 chiffres, mention « valable 10 minutes », bouton renvoi avec compte à rebours 60 s |
| 2.2 | Coller un code erroné (ex. 000000 si différent du bon) | « Code erroné ou expiré. » + action ; **aucun compte créé** |
| 2.3 | Saisir le bon code (Mailpit ou logs serveur) | Redirection vers l'espace coureur, email affiché |
| 2.4 | Ouvrir une 2ᵉ fenêtre privée, se reconnecter (nouveau code) | Connexion OK (nouveau code dans Mailpit) |
| 2.5 | Revenir à la fenêtre A, recharger l'espace coureur | **Session révoquée** : retour vers /connexion |
| 2.6 | Demander 3 codes puis un 4ᵉ immédiatement pour un même email | 4ᵉ demande refusée : « Trop de codes demandés » + compte à rebours |
| 2.7 | Saisir une adresse malformée (`test@`) | « Cette adresse email ne semble pas valide. » (vouvoiement — page publique) |

- [ ] S2 conforme — Observations : …………

## S3 — Formulaire d'inscription (story 1-3)

**Précondition :** connecté en coureur, espace coureur affiché.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | Suivre « M'inscrire à l'édition 2027 » | Formulaire : identité, épreuve (Longue 35 km / Moyenne 12 km), urgence, t-shirt |
| 3.2 | Soumettre vide | Blocage client, chaque champ manquant nommé |
| 3.3 | Date de naissance donnant 8 ans à la course | « Tu dois avoir entre 10 et 100 ans… » |
| 3.4 | Soumettre complet (photo la catégorie calculée en direct si affichée) | Retour espace coureur ; récap épreuve + catégorie + t-shirt ; compteur checklist progressé |
| 3.5 | Re-soumettre avec l'autre épreuve (« Modifier mon inscription ») | Mise à jour sans doublon |
| 3.6 | (Optionnel SQL) `UPDATE edition SET registration_closes_at = now() - interval '1 day';` puis tenter une modification | Refus « Les inscriptions sont fermées » avec la date ; restaurer ensuite (`2027-03-16T22:59:59Z`) |
| 3.7 | Regarder le haut de la page /inscription | Fil d'étapes « Étapes du dossier » : Inscription, Documents, Paiement, Validation. Inscription porte « Étape 1 sur 4 — en cours » ; les trois suivantes n'affichent AUCUN état et ne sont pas cliquables |

- [ ] S3 conforme — Observations : …………

## S4 — Décharge + règlement (story 1-4)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | Ouvrir l'étape acceptations depuis la checklist | Les DEUX documents lisibles (dépliage), version affichée, texte provisoire balisé |
| 4.2 | Cocher une seule case et soumettre | Refus : les deux acceptations sont exigées ensemble |
| 4.3 | Cocher les deux et accepter | Récap : « acceptés le … (décharge v1 · règlement v1) », horodatage visible |
| 4.4 | Ré-accepter | Horodatage mis à jour (tant que le dossier n'est pas validé) |
| 4.5 | Fil d'étapes en haut de /acceptations | Inscription marquée « Fait » et cliquable (retour vers /inscription) ; Documents porte « Étape 2 sur 4 — en cours » ; Paiement et Validation sans mention ni lien |

- [ ] S4 conforme — Observations : …………

## S5 — Preuve de paiement CCP (story 1-5)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 5.1 | Déposer une vraie photo (2 Mo+) | Feedback de compression (« 2,1 Mo → ~xxx Ko »), prévisualisation |
| 5.2 | Déposer un `.txt` | Rejet AVANT envoi, formats acceptés listés |
| 5.3 | Déposer un `.heic` | Message dédié de conversion iPhone |
| 5.4 | Couper Mailpit (`dev-mail.sh down`), puis déposer un PDF valide | Refus propre ; PDF retenté après `dev-mail.sh up` : OK |
| 5.5 | Déposer une 2ᵉ image | Nouvelle preuve active ; l'ancienne conservée (remplacée) |
| 5.6 | Vérifier `apps/web/data/preuves/` (ou STORAGE_DIR) | Fichiers UUID ≤ 300 Ko, jamais le nom d'origine |
| 5.7 | Fil d'étapes en haut de /preuve | Inscription « Fait » (lien vers /inscription) ; Documents « Fait » ou « À faire » selon l'état réel du dossier (lien vers /acceptations) ; Paiement porte « Étape 3 sur 4 — en cours » ; Validation sans mention ni lien |

- [ ] S5 conforme — Observations : …………

## S6 — Validation/refus organisateur (story 1-6)

**Précondition :** le coureur a un dossier complet (S3+S4+S5).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 6.1 | Se connecter en `orga@example.dz` | Lien « Administration » dans l'en-tête |
| 6.2 | `/admin/dossiers` | Liste des coureurs, recherche nom/email, chips de statut |
| 6.3 | Ouvrir le dossier du coureur | Pièces du dossier, preuve téléchargeable (le fichier s'ouvre), mention « Décidé par » vide |
| 6.4 | Refuser SANS motif | Blocage : motif obligatoire |
| 6.5 | Refuser avec motif « Reçu illisible » | Statut refusé ; traçabilité « Décidé par orga@… le … » |
| 6.6 | Côté coureur (reconnexion) | Checklist : motif affiché + « Déposer une nouvelle preuve » + bouton « Appeler l'équipe » |
| 6.7 | Coureur redépose la MÊME image (octets identiques) | Message « Cette preuve identique a déjà été refusée… » (pas de réouverture silencieuse) |
| 6.8 | Coureur dépose une AUTRE image | Dossier repasse « en constitution », motif retiré |
| 6.9 | Organisateur : VALIDER | Statut validé ; « Décidé par » renseigné |
| 6.10 | Coureur tente de modifier son inscription | Refus : dossier validé immuable |
| 6.11 | Se connecter en coureur lambda et taper `/admin/dossiers` | Refusé (403/redirection) — pas d'accès |

- [ ] S6 conforme — Observations : …………

## S7 — Checklist self-service (story 1-7)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 7.1 | Compte frais (email vierge) : espace coureur | Checklist 6 pièces, « 1 pièce sur 6 » (email), chaque pièce manquante = action en lien |
| 7.2 | Après inscription seulement | Compteur progresse, ligne formulaire verte |
| 7.3 | Dossier complet + validé | 6/6, bandeau « Dossier validé — dossard prêt », récap (épreuve, catégorie, t-shirt, urgence, date) sous la liste |
| 7.4 | Assistance | Bouton « Appeler l'équipe » visible en permanence (numéro configurable) |

- [ ] S7 conforme — Observations : …………

## S8 — Notifications par email (story 1-8)

**Précondition :** Mailpit up.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 8.1 | Nouvelle inscription (email vierge) | Mailpit : « Ton inscription est enregistrée » avec prénom/épreuve et lien espace coureur |
| 8.2 | Validation (S6.9) | Email « dossier validé » |
| 8.3 | Refus (S6.5) | Email refus : **motif** + « Appeler l'équipe : +213 … » |
| 8.4 | Couper Mailpit, faire un refus, relancer Mailpit | Ligne en échec dans `email_outbox` (statut failed) ; `pnpm -F @azzel/web emails:send` → l'email part à la reprise |
| 8.5 | `SELECT type, statut, attempts, last_error FROM email_outbox ORDER BY created_at DESC LIMIT 5;` (psql, base azzel) | État cohérent : sent pour les partis, attempts croissant pour les échecs, jamais de doublon sent |

- [ ] S8 conforme — Observations : …………

## S9 — Isolation multi-organisation (story 1-9) — recette technique

**Preuve automatisée :** `pnpm test` inclut `multi-org.integration.test.ts` (org B sans DDL, invisibilité croisée). Recette manuelle complémentaire en psql :

```bash
docker exec -it azzel-postgres psql -U azzel_app -d azzel
```

| # | Action | Résultat attendu |
|---|--------|------------------|
| 9.1 | `SELECT current_user;` | `azzel_app` (jamais le propriétaire — warning sinon dans les logs dev) |
| 9.2 | `SELECT count(*) FROM coureur;` | **0** (pas de GUC posé → RLS) |
| 9.3 | `BEGIN; SELECT set_config('app.organisation_id', '<id org A>', true); SELECT count(*) FROM coureur; ROLLBACK;` | Les lignes de l'org A uniquement |
| 9.4 | `CREATE TABLE test_x(id int);` | Permission denied (rôle app sans DDL) |

- [ ] S9 conforme — Observations : …………

---

## Transverse (tous modules)

- [ ] Navigation mobile (360 px) : aucune barre de défilement horizontal, cibles ≥ 44 px
- [ ] `prefers-reduced-motion` activé : aucune animation intrusive
- [ ] Lecteur d'écran (rapide) : erreurs annoncées, logos avec alternative textuelle

## Tableau de synthèse

| Module | Statut (OK / Écart) | Observations |
|--------|--------------------|--------------|
| S1 Fondation & thème | | |
| S2 Connexion & session | | |
| S3 Inscription | | |
| S4 Acceptations | | |
| S5 Preuve CCP | | |
| S6 Validation organisateur | | |
| S7 Checklist | | |
| S8 Emails | | |
| S9 RLS multi-org | | |
