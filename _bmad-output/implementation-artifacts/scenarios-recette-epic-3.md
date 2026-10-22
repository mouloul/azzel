# Scénarios de recette — Épopée 3 : Armer les volontaires

**Produit :** Azzel · **Périmètre :** stories 3-1 → 3-4 · **Date :** 2026-10-23
**Durée estimée :** 60–80 min (module par module, arrêt/reprise possible)

Chaque module se teste indépendamment : cochez au fur et à mesure et notez les écarts dans la colonne Observations du tableau final. Aucune connaissance du code n'est requise.

---

## 0. Préparation de l'environnement (5 min)

```bash
bash scripts/dev-db.sh up        # Postgres 54329 — crée/migre .env si besoin
bash scripts/dev-mail.sh up      # faux SMTP — UI http://localhost:8026
pnpm -F @azzel/web db:migrate    # 0001–0022
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web   # http://localhost:3000
```

**Vérifications préalables :**
- [ ] `http://localhost:8026` répond (Mailpit)
- [ ] Accueil `localhost:3000` s'affiche (charte vitrine)

**Comptes de test :**
- Organisateur : `orga@example.dz` (connexion par code email, promu via `AZZEL_ADMIN_EMAILS`)
- Volontaires : créés par l'import du module S1 (aucun compte à préparer)

**Prérequis données :** au moins 1 coureur avec dossier **validé** (voir recette épopée 1, module S6) pour le module S4 — sinon suivre S4 après avoir validé un dossier.

---

## S1 — Import Excel des volontaires et invitations (story 3-1)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Se connecter en organisateur, ouvrir **Administration → Volontaires** (ou `/admin/volontaires`) | Page « Volontaires », lien « Télécharger le gabarit .xlsx » visible |
| 1.2 | Télécharger le gabarit | Fichier `volontaires-modele.xlsx` avec en-tête Nom / Email / Téléphone |
| 1.3 | Préparer un CSV (bloc-notes) : `Nom;Email;Téléphone` puis 4 lignes — une complète (`Karim;karim@exemple.dz;+213 555 010 210`), une sans téléphone, une avec email cassé (`mokrane;pas-un-email;`), une doublon de Karim — enregistrer en **CSV UTF-8**, importer | Rapport ligne par ligne : 2 « Créé », 1 « Rejeté — email invalide », 1 « Rejeté — doublon dans le fichier » ; résumé « 2 créés · 0 ignorés · 2 rejetés · 2 invitations en file d'envoi » |
| 1.4 | Mailpit (`localhost:8026`) | 2 emails « Azzel — ton accès volontaire », tutoiement, lien `http://localhost:3000/invitation?jeton=…`, mention « valable 14 jours » |
| 1.5 | Ré-importer le même fichier | Lignes Karim « Ignoré — déjà volontaire, invitation non renvoyée » ; aucun nouvel email dans Mailpit |
| 1.6 | (Base, optionnel) `bash scripts/dev-db.sh psql -c "select email, role from account where role='volontaire'"` | Les 2 comptes créés, rôle `volontaire` |
| 1.7 | Ouvrir le lien d'invitation de Karim (Mailpit), définir un mot de passe (8 caractères min) puis confirmation différente | Message d'erreur clair « ne correspondent pas » |
| 1.8 | Définir le même mot de passe deux fois, valider | Session ouverte, redirection vers `/volontaires` (« Ton accès mission ») |
| 1.9 | Se déconnecter, rouvrir `/connexion`, saisir l'email de Karim et demander un code | Refus : « Ce compte est un compte volontaire : la connexion par code est réservée aux coureurs et organisateurs » + orientation vers la page volontaire ; aucun code reçu |
| 1.10 | `/connexion-volontaire` : mauvais mot de passe puis bon mot de passe | Message générique « Email ou mot de passe incorrect » (jamais « compte inconnu ») puis connexion OK |
| 1.11 | Lien discret « Volontaire ? Connecte-toi ici » sur `/connexion` | Présent, mène à `/connexion-volontaire` |
| 1.12 | Sur `/admin/volontaires`, bouton « Renvoyer l'invitation » d'un volontaire non activé | Nouvel email dans Mailpit ; l'ancien lien ne marche plus (« inconnu ou déjà utilisé ») |
| 1.13 | Lien d'invitation expiré (attendre 14 j ou modifier `expire_le` en base) puis l'ouvrir | « Ce lien d'invitation a expiré (14 jours) » + action « demande à l'organisation de te le renvoyer » |

---

## S2 — Secteurs et missions typées (story 3-2)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | `/admin/missions` (organisateur) | Titre « Secteurs et missions — Édition 2027 », formulaire « Nouveau secteur » |
| 2.2 | Créer le secteur « Village départ » (lieu « Place du village »), contact `+213 555 010 203` | Secteur listé avec lieu et contact |
| 2.3 | Créer un 2ᵉ secteur « Village départ » | Refus : « Un secteur porte déjà ce nom sur cette édition » |
| 2.4 | Créer la mission « Accueil village » : secteur Village départ, type Accueil, 06 h–12 h, consignes « Arrive 15 min avant. » | Mission listée sous le secteur, chip **Vacante** |
| 2.5 | Créer la mission « Barrière PK 10 » : AUTRE secteur (en créer un « Tronçon forêt »), type Sécurité tronçon, 10 h–14 h | Mission vacante sous Tronçon forêt |
| 2.6 | Tenter une mission fin avant début | Erreur champ : « La fin doit être après le début » |
| 2.7 | Affecter Karim à « Accueil village » | Chip passe **Couverte**, « Karim » listé avec bouton Désaffecter |
| 2.8 | Affecter Karim à « Barrière PK 10 » (10–14 h, chevauche 06–12 h) | Affectation ENREGISTRÉE + bandeau « Chevauchement d'horaires pour Karim — affectation enregistrée quand même » listant Accueil village ; jamais bloqué |
| 2.9 | Ré-affecter Karim à Accueil village | Aucune erreur (doublon ignoré proprement) |
| 2.10 | Désaffecter Karim d'Accueil village (dernier volontaire) | Chip repasse **Vacante** |
| 2.11 | Supprimer le secteur « Tronçon forêt » (il porte Barrière PK 10) | Refus : « porte encore 1 mission(s) : retire ses missions d'abord » |
| 2.12 | Supprimer « Barrière PK 10 » puis le secteur | Mission (et ses affectations) supprimée, puis secteur supprimé |
| 2.13 | Se connecter en volontaire (`/volontaires`) | « Tes missions » de Karim (secteur, type, titre, horaires locales, consignes) + « Toutes les missions de l'édition » avec état couverture ; tutoiement |

---

## S3 — Fiche mission hors-ligne, PWA (story 3-3)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | En volontaire sur `/volontaires` (1ʳᵉ ouverture) | Bandeau « Départ à l'aube ? … mode sombre » avec Oui / Plus tard |
| 3.2 | Cliquer « Oui, mode sombre » | Thème passe en sombre ; bandeau disparaît ; bascule toujours en en-tête ; choix mémorisé au rechargement |
| 3.3 | Badge d'état en haut de page | « synchronisé à HH:MM » (heure locale) |
| 3.4 | DevTools → Application → Manifest | « Azzel Volontaires », start_url `/volontaires`, standalone, icônes vert Djurdjura |
| 3.5 | DevTools → Application → Service Workers | `sw-volontaires.js` activé, scope `/volontaires` |
| 3.6 | DevTools → Application → IndexedDB → `azzel-volontaires` | Store `etat` peuplé |
| 3.7 | DevTools → Network → **Offline**, recharger `/volontaires` | La fiche s'affiche toujours (shell servi du cache), badge **HORS-LIGNE PRÊT** + « hors-ligne — données du JJ/MM HH:MM » |
| 3.8 | Contact PC du secteur (s'il est renseigné) | Gros bouton vert « Appeler le PC du secteur » + numéro ; un clic ouvre la numérotation (`tel:`) ; cible ≥ 48 px |
| 3.9 | Bandeau « Appeler l'équipe » en bas de page | Toujours visible (barre collante) |
| 3.10 | Repasser **Online**, recharger | Retour à « synchronisé à HH:MM » |
| 3.11 | (Android Chrome ou iOS Safari si disponible) Partage → « Ajouter à l'écran d'accueil », ouvrir depuis l'icône, mode avion | Ouverture standalone avec icône dédiée ; fiche consultable sans réseau |
| 3.12 | Se déconnecter depuis `/volontaires` | Retour connexion ; DevTools → IndexedDB : la base `azzel-volontaires` a disparu (appareil partagé : rien ne survit au compte) |

---

## S4 — Préchargement de l'annuaire des coureurs (story 3-4)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | Organisateur, `/admin/dossiers` | Bouton « Attribuer les dossards », colonne « Dossard » (— pour tous) |
| 4.2 | Cliquer « Attribuer les dossards » | « N dossard(s) attribué(s) (1–N). » ; la colonne se remplit (1, 2, 3… dans l'ordre d'inscription) |
| 4.3 | Re-cliquer immédiatement | « Rien à attribuer : aucun dossier validé sans dossard. » — rien ne change |
| 4.4 | Valider un nouveau dossier (recette épopée 1 S6) puis re-cliquer | Suite de la numérotation (N+1), les existants inchangés |
| 4.5 | Volontaire, `/volontaires` | Section « Annuaire des coureurs », badge « **Annuaire prêt — N coureurs** » (annoncé au lecteur d'écran : role=status) ; AUCUNE liste de noms affichée |
| 4.6 | DevTools → Application → IndexedDB → `azzel-volontaires` | Store `annuaire` peuplé (version 2) |
| 4.7 | DevTools → Network → Offline, recharger | Badge « hors-ligne — annuaire du JJ/MM HH:MM » ; fiche toujours lisible |
| 4.8 | Organisateur : attribuer de nouveaux dossards, repasser le volontaire Online, recharger | Le badge repasse « Annuaire prêt » avec le nouveau compte |
| 4.9 | Cas limite : ouvrir `/volontaires` avant toute attribution de dossard | « aucun coureur à dossard — rien à précharger » (pas d'erreur) |
| 4.10 | Fiche détaillée d'un coureur (`/admin/dossiers/[id]`) | « Dossard attribué : N » visible quand attribué |

---

## Tableau de synthèse

| Module | Story | Statut | Observations |
|--------|-------|--------|--------------|
| S1 — Import volontaires + invitations | 3-1 | ☐ ☐ ☐ | |
| S2 — Secteurs et missions typées | 3-2 | ☐ ☐ ☐ | |
| S3 — Fiche mission hors-ligne PWA | 3-3 | ☐ ☐ ☐ | |
| S4 — Annuaire des coureurs | 3-4 | ☐ ☐ ☐ | |

**Légende :** ☐ à cocher — tests passés / anomalies mineures / bloquantes. Toute anomalie bloquante : la noter avec le numéro d'étape (ex. « 1.3 : doublon non rejeté ») et préserver l'environnement.
