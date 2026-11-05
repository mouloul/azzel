# Scénarios de recette — Épopée 10 : Refonte des surfaces d'exploitation

**Produit :** Azzel · **Périmètre :** stories 10.1 → 10.4 · **Date :** 2026-11-04
**Statut :** document écrit avec les corrections de la revue indépendante (`revue-epopee-10.md`) — B1, I2, I6, I7, I8, I9, I10, M1–M5, M7–M10, M12 appliquées.
**Avertissement central :** aucune vérification **visuelle** n'a été faite pendant le développement (ni navigateur piloté, ni appareil). Les modules ci-dessous vérifient les **comportements et les textes** ; la section « À l'œil » de chaque module liste ce qu'un humain doit juger sur le rendu réel.

**Durée estimée :** 60–90 min (module par module, arrêt/reprise possible).

Les recettes des épopées précédentes restent la référence pour les parcours complets : `scenarios-recette-epic-3.md` (volontaires), `-4.md` (scan), `-5.md` (PC course), `-6.md` (app coureurs) — toutes réalignées sur les écrans refondus par l'épopée 10. La présente recette ne reteste que ce que la refonte a touché.

---

## 0. Préparation de l'environnement (10 min)

```bash
bash scripts/dev-db.sh up        # Postgres 54329
bash scripts/dev-mail.sh up      # faux SMTP — UI http://localhost:8026
pnpm -F @azzel/web db:migrate    # migrations à jour
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web   # http://localhost:3000
```

Pour le module S2 (app coureurs), en sus — un appareil ou simulateur avec Expo dev client :

```bash
pnpm dev:runners                 # expo start --dev-client (API → http://localhost:3000 par défaut)
```

**Vérifications préalables :**
- [ ] `http://localhost:8026` répond (Mailpit)
- [ ] Accueil `localhost:3000` s'affiche (thème clair ou sombre selon la préférence système)
- [ ] Comptes de test disponibles : `orga@example.dz` (organisateur), un volontaire invité (module S1), un coureur avec dossier validé + e-dossard (revoir S6 de la recette épopée 1 pour créer/valider un dossier)

---

## S1 — PWA volontaires sur le socle (story 10.1)

**Précondition :** un volontaire connecté sur `/volontaires` (invitation + code, voir recette épopée 3), une mission scan_checkpoint affectée pour la dernière étape.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Ouvrir `/volontaires` | « Ta fiche mission » est le titre le plus visible (24 px, gras) ; la fiche est une carte à coins arrondis avec filet et ombre légère |
| 1.2 | Regarder le bandeau de synchronisation | Sans file d'attente : « ✓ envoyés — file : 0 ». Après des scans hors réseau : « ◷ N passages en attente » (le mot « passages » est bien là) |
| 1.3 | Ouvrir `Journal sync` (détail du bandeau) au clavier (Tabulation) | Le commutateur du journal montre un anneau de focus visible (correction UX-DR-23 de la story 10.4) |
| 1.4 | Passer hors ligne (DevTools → Offline), recharger `/volontaires` | La page se RECHARGE sans réseau (service worker) : cartes, styles et boutons identiques — le socle est précaché |
| 1.5 | Suivre le lien scan, autoriser caméra, scanner un QR e-dossard connu | Voyant vert plein cadre, texte ≥ 24 px, bip : retour quasi instantané (le bip ne suit PAS l'écriture hors-ligne) |
| 1.6 | Scanner un QR inconnu | Voyant rouge ⚠ avec numéro en toutes lettres, bouton « Appeler le PC » à cible ≥ 44 px |
| 1.7 | Activer `prefers-reduced-motion` (DevTools → Rendering) et refaire 1.5 | Le voyant ne clignote plus (statique), le texte reste lisible |

**À juger à l'œil (aucun rendu comparé au design) :**
- [ ] Rayon des cartes : passé de 6 px à 16 px, ombre légère — harmonieux sur mobile comme au bureau ?
- [ ] CTA en pilules (bords pleins) et chip « HORS-LIGNE PRÊT » avec bordure et majuscules
- [ ] Typo des CTA en Barlow Condensed : lisible en plein soleil ?

- [ ] S1 conforme — Observations : …………

---

## S2 — App coureurs : état de suivi honnête + déconnexion confirmée (stories 10.2 + corrections B1, I2, I10)

**Précondition :** simulateur/appareil avec Expo dev client, coureur connecté, e-dossard visible (dossier validé au préalable côté organisateur).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Ouvrir l'écran « Suivi GPS de ma course » | L'interrupteur est ÉTEINT par défaut ; libellé « Suivi désactivé », texte « Désactivé : rien n'est enregistré. » |
| 2.2 | **Services de localisation COUPÉS au niveau du téléphone**, puis activer l'interrupteur | **Jamais « Suivi activé »** : libellé « **Suivi demandé, pas démarré** » et texte disant que le suivi n'a pas pu démarrer, qu'il faut vérifier les services de localisation puis éteindre/rallumer l'interrupteur (correction B1) |
| 2.3 | Services de localisation réactivés, interrupteur éteint puis rallumé | « Suivi activé » (ou « Suivi activé (app ouverte) » si seule la permission avant-plan est accordée) ; le texte « Ta position est partagée toutes les 7 minutes… » n'apparaît QUE dans ces états réellement actifs |
| 2.4 | Refuser la localisation à l'OS, rallumer l'interrupteur | « Suivi en pause » — phrase sans culpabilisation, renvoi vers le guide |
| 2.5 | Sur l'écran dossier (ou e-dossard), regarder « Se déconnecter » | Le bouton est **différent des autres par la forme** : contour épais rouge sur fond transparent, pictogramme ⚠ devant le libellé — pas une pastille pleine comme le bouton principal (correction I2) |
| 2.6 | Appuyer sur « Se déconnecter » | **Confirmation native** : titre « Supprimer ton e-dossard de ce téléphone ? », message nommant ce qui sera perdu (e-dossard hors-ligne et/ou positions en attente), boutons « Annuler » / « Me déconnecter » (correction I10) |
| 2.7 | Choisir « Annuler » | Rien ne se passe : session, e-dossard et positions intacts |
| 2.8 | Refaire 2.6 et choisir « Me déconnecter » | Retour à l'écran de connexion ; e-dossard et positions supprimés de l'appareil (effet inchangé par la confirmation) |
| 2.9 | Se reconnecter, ouvrir l'e-dossard | Carte sombre fixe (claire ou sombre selon le téléphone), numéro 74 px, QR sur carte blanche lisible |

**À juger à l'œil (rendu natif jamais vérifié) :**
- [ ] Le contour 3 px du destructeur et le ⚠ : équilibre visuel, pas de sur-marquage ?
- [ ] À l'état pressé, le destructeur s'inverse en pastille pleine rouge : feedback net ?
- [ ] Menlo (iOS) / monospace (Android) sur l'heure du journal et « HORS-LIGNE PRÊT »
- [ ] Focus visible sur les boutons au clavier/VoiceOver

- [ ] S2 conforme — Observations : …………

---

## S3 — Back-office sur le socle : pastilles, compteurs, détail aligné (stories 10.3 + corrections I9, M1, M2, M12)

**Précondition :** connecté en `orga@example.dz` ; au moins un dossier par statut (en constitution / validé / refusé).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | Ouvrir `/admin/dossiers` | Tableau à lignes séparées par des filets, colonnes Dossard/Inscrit le en chiffres alignés à droite (police mono) |
| 3.2 | Regarder la colonne Statut | Chaque statut est une **pastille** : point coloré + libellé en toutes lettres (« Validé », « En constitution », « Refusé ») — jamais la couleur seule ; le motif de refus s'affiche sous la pastille |
| 3.3 | Ouvrir le détail d'un dossier (Examiner) | Le statut en haut de page porte **la même pastille** que la liste (correction I9) : plus aucun ancien badge à bordure pointillée |
| 3.4 | Revenir à la liste, lire les compteurs de tête | Quatre compteurs : Validés, En constitution, **Acceptations manquantes**, Dossards attribués. Le compteur « Acceptations manquantes » **exclut les dossiers refusés** (correction M1) — vérifier avec la formule : incomplets non refusés |
| 3.5 | Chercher un nom (recherche) | Compteurs recalculés sur la liste affichée ; mention « (recherche active) » sous les compteurs |
| 3.6 | Créer > 200 coureurs (ou avec une base déjà garnie) | Mention « Comptages sur la liste affichée — tronquée à 200 dossiers » ; en pied : « N dossier(s) affiché(s) — 200 maximum » (le nombre vient de la constante, correction M2). Les compteurs **ne sont pas des liens** : aucun filtre de statut n'existe, le curseur ne change pas au survol |
| 3.7 | Ouvrir `/admin/volontaires` | Même gabarit de tableau ; statuts d'invitation et rapport d'import en pastilles (point + libellé) |
| 3.8 | Rétrécir la fenêtre sous 640 px sur `/admin/volontaires` | Chaque ligne devient une carte empilée ; les étiquettes (Nom, Email, Ligne…) sont **à gauche**, et le numéro de ligne est **aligné à gauche** sous son étiquette — plus calé à droite (correction M8) |
| 3.9 | Ouvrir `/admin/missions`, `/admin/sponsors`, `/admin/retour-en-images`, `/admin/contenus` | Les étiquettes (type de mission, couverture, signature, ordre, « À confirmer par le comité ») apparaissent en chips/pastilles du socle — aucune étiquette « nue » sans style |
| 3.10 | Ouvrir `/admin/course` | La fraîcheur (« il y a N s » / heure) est en **en-tête** du board, à gauche, à côté de « Saisir un abandon » — disposition validée, pas en pied |
| 3.11 | Survoler une ligne de board au PC course | Le bouton « … » (annulation) apparaît ; sa cible fait au moins 44 px de haut et le « … » n'est pas collé au bord (correction I6) |
| 3.12 | Naviguer dans la barre d'administration (Dossiers, Volontaires…) | Chaque entrée de navigation a une cible ≥ 44 px ; l'onglet courant porte un filet coloré en plus de la couleur |

**À juger à l'œil :**
- [ ] Rayon 16 px des cartes admin + pastilles : cohérent avec la maquette `maquettes-refonte-design-2026-11-02.md` (artboard AdminDossiers absent du dépôt — jugement à la maquette générale)
- [ ] Compteurs : hiérarchie chiffre (24 px) / libellé lisible sans survol

- [ ] S3 conforme — Observations : …………

---

## S4 — Non-régression des garanties (story 10.4)

Ce module confirme à la main ce que les gardes automatiques épingle ; tout échec ici = régression sérieuse.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | `pnpm test` | Suite verte (gardes contrastes exploitation + thème coureurs, cibles 44 px, canaux du scan, câblage émission immédiate par mode, précache SW, animation unique course.css) |
| 4.2 | Sur `/admin/course` : laisser la page ouverte > 10 s | Le board se rafraîchit SANS clignotement de l'écran (seul le bloc alertes clignote, 1 flash/s max, et uniquement s'il y a des alertes) |
| 4.3 | `prefers-reduced-motion` activé sur `/admin/course` avec alertes | Bloc alertes statique (aucun flash) |
| 4.4 | Liens texte un peu partout (« Examiner », « pilote la course en direct… », « Modifier », « Supprimer » des managers) | Cibles ≥ 44 px de haut, texte souligné, aucune mise en page cassée par la hauteur (correction I6 — vérifier les liens DANS un paragraphe : la ligne s'écarte, c'est attendu) |
| 4.5 | Thème sombre du navigateur sur `/volontaires` et `/admin/*` | Bandeaux sync, pastilles et compteurs restent lisibles (encres sur fonds adaptés) |
| 4.6 | Hors ligne sur `/volontaires/scan`, scanner | Voyant + bip immédiats ; passage « NON enregistré sur cet appareil » si l'annuaire écrit en échec — jamais de mensonge d'état |

**À l'œil (borné numériquement, à valider en vrai) :**
- [ ] Contraste réel caméra + plein soleil (voile 96 %) : les textes du cadre restent lisibles
- [ ] Latence de confirmation du scan ressentie < 1 s sur l'appareil

- [ ] S4 conforme — Observations : …………

---

## Transverse (tous modules)

- [ ] Navigation mobile 360 px : aucune barre de défilement horizontal sur `/volontaires`, `/admin/dossiers`, `/admin/volontaires`
- [ ] Lecteur d'écran (rapide) : pastilles de statut lues avec leur libellé ; erreurs annoncées ; le pictogramme ⚠ du destructeur n'est pas lu en double (aria-hidden)
- [ ] Deux thèmes (clair/sombre) : aucun texte illisible sur les surfaces touchées

## Tableau de synthèse

| Module | Statut (OK / Écart) | Observations |
|--------|--------------------|--------------|
| S1 PWA volontaires (10.1) | | |
| S2 App coureurs (10.2, B1/I2/I10) | | |
| S3 Back-office (10.3, I9/M1/M2/M12) | | |
| S4 Non-régression (10.4, I6/M4) | | |
