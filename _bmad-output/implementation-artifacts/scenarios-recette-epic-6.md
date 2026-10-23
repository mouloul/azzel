# Scénarios de recette — Épopée 6 : App coureurs & suivi GPS

**Produit :** Azzel · **Périmètre :** stories 6-1 → 6-4 · **Date :** 2026-10-23
**Durée estimée :** 75–100 min (module par module, arrêt/reprise possible)

Chaque module se teste indépendamment. Prérequis : recettes épopées 1 à 5 terminées (comptes coureurs, dossier validé + dossard attribué, e-dossard consulté au moins une fois).

---

## 0. Préparation de l'environnement (10 min)

```bash
bash scripts/dev-db.sh up        # Postgres 54329
bash scripts/dev-mail.sh up      # Mailpit — http://localhost:8026
pnpm -F @azzel/web db:migrate    # 0001–0032
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web   # http://localhost:3000
```

**Dev build de l'app coureurs (obligatoire — jamais Expo Go) :**

```bash
cd apps/runners
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 eas build --profile development --platform android
# (ou IP LAN de la machine pour un téléphone physique)
```

Installer l'APK/`dev build` retourné par EAS, puis `pnpm dev:runners` et ouvrir l'app sur la dev build.

**Prérequis données :**
- [ ] Coureur A : dossier VALIDÉ + dossard attribué + e-dossard consulté (web) — jeton QR connu
- [ ] Coureur B : dossier EN COURS (pièces manquantes)
- [ ] Compte web du coureur A utilisable (email + code, Mailpit)
- [ ] Édition avec `race_date` à **J-7 aujourd'hui** pour S4 (UPDATE SQL si besoin : `update edition set race_date = current_date + 7 where slug='2027';`)

---

## S1 — Installation et onboarding (story 6-1)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Lancer l'app sur le téléphone | Écran « Course dans ta poche » : saisie email (jamais de contenu tant que rien n'est chargé) |
| 1.2 | Email du coureur A → « Recevoir mon code » | Écran code ; code reçu dans Mailpit (6 chiffres, expire 10 min) |
| 1.3 | Double-tap rapide sur « Recevoir mon code » | Boutons DÉSABLIS pendant la requête — un seul envoi |
| 1.4 | Saisir le code | Connexion ; dossier déjà validé → **e-dossard DIRECT** (étapes court-circuitées) : carte sombre, numéro 74 px, badge « HORS-LIGNE PRÊT », QR sur carte blanche |
| 1.5 | Le QR commence par `azzel-e1:` | Jamais le numéro de dossard nu |
| 1.6 | Coureur B (dossier en cours) | Écran checklist : pièces Fait/À faire en toutes lettres, jamais la couleur seule |
| 1.7 | Mode avion → rouvrir l'app | Dossier/e-dossard servis du cache + bandeau « ◷ HORS-LIGNE » — jamais d'écran vide |
| 1.8 | Mode avion SANS avoir ouvert l'app avant | Écran « Première connexion requise » + bouton Réessayer |
| 1.9 | Se connecter au WEB avec le même compte (autre navigateur) | La session de l'app est révoquée (AD-5) : prochaine requête app → écran de reconnexion, cache CONSERVÉ |
| 1.10 | « Se déconnecter » dans l'app | Données locales purgées (e-dossard invisible hors reconnexion) |

## S2 — Suivi GPS opt-in (story 6-2)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Écran Suivi (depuis dossier ou e-dossard) | Toggle à OFF par défaut + texte « **Désactivé : rien n'est enregistré.** » |
| 2.2 | Activer le suivi | Demandes de permission (avant-plan + arrière-plan) puis état actif ; navigation automatique vers la rubrique batterie (S3) |
| 2.3 | Refuser la permission | Suivi silencieusement inactif, message SANS culpabilisation (« en pause… il repartira tout seul ») — aucun crash |
| 2.4 | Attendre un cycle (ou marcher) | Bandeau « ◷ 1 position en attente » ; le journal (clic bandeau) montre l'entrée d'envoi après synchronisation « ✓ envoyés — file : 0 » |
| 2.5 | Mode avion pendant 2 cycles puis réseau | Les positions s'accumulent (bandeau N croissant) puis partent EN LOT au retour réseau ; `select count(*) from position;` cohérent, aucun doublon au rejeu |
| 2.6 | Fréquence | Une position toutes les ~7 min — jamais plus souvent (vérifier les `capte_at` en base) |
| 2.7 | Désactiver le suivi | Watcher stoppé : AUCUNE nouvelle position en base ; bandeau visible avec « N positions attendent la réactivation… » si file non vide |
| 2.8 | `psql` : `select count(*) from appareil_coureur;` | Une ligne par appareil, jeton HASHÉ (jamais le brut) |
| 2.9 | AD-5 : login web du compte PUIS sync app | Les positions partent quand même (jeton d'appareil indépendant des sessions) |
| 2.10 | Rouvrir l'app (premier plan) avec suivi activé | Sync déclenchée automatiquement |

## S3 — Guide permission « Autoriser une fois » (story 6.3)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | Suivi activé, puis iOS : choisir « Autoriser une fois » puis verrouiller/déverrouiller et rouvrir l'app | Écran guide AUTO-affiché : étapes numérotées, chemin « Réglages > Azzel > Localisation > Toujours » EN EXERGUE, bouton contour « Ouvrir les Réglages » |
| 3.2 | « Ouvrir les Réglages » | Les réglages système de l'app s'ouvrent |
| 3.3 | Mettre « Toujours » puis revenir dans l'app | Le suivi REPART SEUL (état actif), le guide disparaît — aucune manipulation |
| 3.4 | Interrompre à nouveau puis rouvrir 3 fois | Guide auto UNE SEULE fois ; ensuite état « interrompu » factuel dans l'écran Suivi (pas de harcèlement) |
| 3.5 | Bouton « Comment garder mon suivi actif ? » (Suivi, tout va bien) | Le guide s'ouvre ; il ne se referme JAMAIS tout seul (ouverte par bouton) |
| 3.6 | Android | Variante « Paramètres > Applications > Azzel > Autorisations > Position > Autoriser tout le temps » |
| 3.7 | Suivi désactivé + permission révoquée + rouvrir l'app | AUCUNE vérification ni guide automatique (« rien n'est enregistré » reste littéral) |

## S4 — Pédagogie batterie et rappel J-7 (story 6-4)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | Rubrique « Préparer ma batterie pour le jour J » (depuis Suivi OU e-dossard) | Carte à puces : 1) partir à 100 %, 2) ne pas tuer l'application, 3) powerbank au village — CONCLUE par « Un point après l'autre, et l'ouvrage est parfait » — Sagesse kabyle (Hanoteau, 1867) ; bouton « Appeler l'équipe » |
| 4.2 | La citation ailleurs | Nulle part ailleurs dans l'app (point d'usage batterie uniquement) |
| 4.3 | Édition à J-7 (prépa §0) puis : `pnpm -F @azzel/web emails:j7` | « N email(s) enfilé(s)… » puis envoyés ; Mailpit : objet « Ta course approche — prépare ta batterie », texte avec les 3 conseils + lien vers l'app + assistance — SANS la citation |
| 4.4 | Relancer `emails:j7` (2× le même jour, puis à J-5) | AUCUN doublon (« déjà enfilé(s) ») ; date de course lisible en français dans le corps |
| 4.5 | Coureur NON validé | Aucun email (vérifier Mailpit) |
| 4.6 | `race_date` passée (J+1) puis `emails:j7` | Aucun enfilement |
| 4.7 | Saison suivante : recréer une édition future avec le même coureur, à J-7, relancer | Le MÊME coureur reçoit le rappel de la NOUVELLE saison (idempotence par édition, pas à vie) |

---

## Synthèse

| Module | Statut | Observations |
|--------|--------|--------------|
| S1 Onboarding app | ☐ | Dev build requise ; AD-5 à tester web↔app |
| S2 Suivi GPS opt-in | ☐ | Vérifier les intervalles en base (7 min fixes) et l'idempotence |
| S3 Guide permission | ☐ | Parcours iOS « Autoriser une fois » réel à confirmer sur device |
| S4 Batterie + J-7 | ☐ | Cron `emails:j7` ; citation uniquement dans la rubrique |
