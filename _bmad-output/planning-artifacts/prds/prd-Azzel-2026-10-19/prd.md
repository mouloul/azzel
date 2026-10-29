---
title: "PRD — Azzel"
status: final
created: 2026-10-19
updated: 2026-10-19
---

# PRD : Azzel

## 0. Objet du document

Ce PRD définit les exigences de la **V1 d'Azzel**, plateforme de gestion de trail offline-first, à livrer pour la 2e édition du trail d'Ait-Aissi (**26 mars 2027**, ≥ 1 000 coureurs, 150–200 volontaires). Il s'appuie sur le product brief final et son addendum (`_bmad-output/planning-artifacts/briefs/brief-Azzel-2026-10-19/`) sans les dupliquer. Destinataires : le développeur (solo, assisté par IA), puis les workflows aval (UX, architecture, epics/stories). Vocabulaire ancré au Glossaire (§3) ; hypothèses balisées `[ASSUMPTION]` et indexées (§9). Jalons : **première version « inscriptions » opérationnelle pour le 15/11/2026** ; répétition générale avant le jour J.

## 1. Vision

Azzel est une plateforme clé en main de gestion de course de trail, conçue pour fonctionner là où le réseau n'existe pas — les zones blanches de la montagne algérienne. Sa première mission est réelle et datée : permettre à l'équipe de jeunes volontaires d'Ait-Aissi (Yakouren, Kabylie) de passer du papier et d'Excel à une organisation moderne, crédible et sûre pour 1 000 coureurs sur deux épreuves.

Azzel n'est pas un outil de chronométrage : c'est un **projet sportif-citoyen outillé** dont la réputation est le produit. Quatre thèmes structurels guident chaque décision — sport, santé, citoyenneté, écologie. La vitrine publique (résultats en direct, égide, sponsors) convertit la réussite terrain en crédibilité durable auprès de la fédération, des médias et des sponsors.

L'outil est fourni gratuitement à l'organisateur par son créateur (bénévole, qui conserve la propriété intellectuelle). Le schéma de données `organisation → événement → édition` est posé dès la V1 pour permettre, après 2027, la **location d'instances par événement** à d'autres organisateurs.

## 2. Utilisateurs cibles

### 2.1 Jobs to be done

- **Organisateur (client)** : piloter tout l'événement de manière centralisée sans infrastructure lourde ; passer de « groupe de jeunes » à organisation crédible.
- **Coureur** : s'inscrire simplement avec une interface qui en jette ; savoir d'un coup d'œil où en est son dossier ; être chronométré et suivi en sécurité.
- **Volontaire** : savoir exactement où se placer et quoi faire le jour J, même sans réseau ; scanner vite et juste.
- **Sponsor (option A unique — Ifri visé — ou option B multiples sans exclusivité)** : être visible sur une vitrine médiatique ; le sponsoring se contractualise hors application.
- **Proches, médias, fédération** : suivre la course de l'extérieur — carte, passages, résultats.

### 2.2 Non-utilisateurs (V1)

- Autres organisateurs (location d'instances : post-V1, le schéma prépare).
- Coureurs sans smartphone ni email `[ASSUMPTION: inscription sur place non traitée en V1 — voir Question ouverte n° 4]`.

### 2.3 Parcours utilisateurs clés

- **UJ-1. Yacine s'inscrit à la longue et boucle son dossier seul.** Yacine, 28 ans, coureur à Alger, découvre la vitrine partagée sur Instagram. Il s'inscrit avec son email, reçoit un code de vérification, choisit l'épreuve longue (~35 km), remplit ses informations, coche la décharge de bonne santé et le règlement intérieur, téléverse sa preuve de virement CCP. État d'entrée : anonyme sur la vitrine. Chemin : inscription → code par mail → formulaire → télversement. Point culminant : sa checklist passe au vert « Dossier validé — dossard prêt », son e-dossard QR apparaît, disponible hors-ligne. Résolution : il revient régulièrement pour les infos pratiques ; à J-7, il sait où retirer son dossard. *Réalise : FR-1 à FR-7.*
- **UJ-2. Karim scanne en zone blanche toute la matinée.** Karim, 19 ans, volontaire du village, reçoit son invitation (import Excel), se connecte avec son email et un code de vérification, découvre sa mission : ravitaillement 2, secteur Djurdjura-ouest, 3 scanneurs. La veille, sa fiche mission est dans son téléphone, hors-ligne. Le jour J, sans réseau : caméra plein écran, bip vert par coureur, voyant rouge sur doublon ou inconnu. À 14 h, en apercevant du réseau, il synchronise : « 217 passages en attente → envoyés ». *Réalise : FR-8 à FR-14.*
- **UJ-3. Nadia pilote la course au PC.** Nadia, organisatrice, sur le portail admin : le matin, le tableau live affiche retraits, partants par épreuve ; à midi, une alerte hors-délais clignote — un coureur attendu au checkpoint 3 ne l'a pas franchi ; elle appelle le secteur ; abandon saisi avec motif. Le soir, les classements sont publiés et partagés ; le lendemain, elle exporte le rapport chiffré pour le directoire. *Réalise : FR-15 à FR-26.*
- **UJ-4. Malika suit son frère depuis Tizi Ouzou.** Sur la vitrine publique, la carte affiche la dernière position GPS connue des coureurs sur le tracé GPX ; elle voit son frère franchir le checkpoint 2 et le classement live se mettre à jour. *Réalise : FR-18 à FR-23.*

## 3. Glossaire

- **Organisation** — Entité qui organise (ex. l'équipe d'Ait-Aissi). Contient des Événements.
- **Événement** — Un trail (ex. « Trail d'Ait-Aissi »). Contient des Éditions.
- **Édition** — Une tenue datée d'un Événement (ex. 2027). Contient coureurs, épreuves, secteurs.
- **Épreuve** — Distance proposée dans une édition : **longue** (~35 km, difficile) ou **moyenne** (10–15 km).
- **Checkpoint** — Point de passage chronométré (ravitaillement ou point intermédiaire). `[ASSUMPTION: nombre par épreuve à confirmer — hypothèse 4 pour la longue, 1–2 pour la moyenne]`
- **Dossier** — Ensemble d'un coureur pour une édition : identité, épreuve, décharge acceptée, règlement accepté, preuve de paiement, statut de validation.
- **Décharge** — Déclaration de bonne santé acceptée en ligne, horodatée.
- **E-dossard** — QR unique du coureur, haute définition, consultable hors-ligne ; sert au retrait, au passage des checkpoints et à l'arrivée.
- **Passage** — Événement horodaté du franchissement d'un checkpoint par un coureur (heure locale de l'appareil scanneur).
- **Secteur** — Zone géographique du dispositif journée (ex. stade, tronçon routier, checkpoint) portant des Missions.
- **Mission** — Affectation d'un volontaire à un secteur pour un rôle (scan, accueil, sécurité, distribution, communication).
- **Sync par lots** — Envoi différé des Passages et positions GPS accumulés hors-ligne dès retour du réseau.
- **Annuaire des coureurs** — Copie locale des coureurs de l'édition (dossard, identité), préchargée sur les appareils des scanneurs avant le départ ; sert à la validation hors-ligne des scans.
- **Guichet** — Point physique de remise des dossards (guichets express le jour J).
- **PC course** — Poste de commandement de l'organisation ; pilote le portail admin le jour J.
- **Directoire** — Organe collégial de direction de l'organisation ; consolide le bilan post-course.
- **Vitrine** — Site public de l'édition : page course, infos pratiques, sponsors, carte, résultats live.
- **Barrière horaire** — Heure limite de franchissement d'un checkpoint au-delà de laquelle un coureur est signalé hors-délais. `[ASSUMPTION: valeurs définies par l'organisateur avant la course]`
- **Instance** — Déploiement isolé d'Azzel pour une Organisation (V1 : instance unique).

## 4. Fonctionnalités

### 4.1 Inscription et dossier coureur

**Description.** Le coureur s'inscrit en ligne avec son email, vérifié par code ; il choisit son épreuve, remplit ses informations, accepte la décharge de bonne santé et le règlement intérieur, téléverse sa preuve de paiement CCP. Une checklist montre d'un coup d'œil ce qui manque ; l'organisateur valide la preuve. Réalise UJ-1.

**Exigences fonctionnelles :**

#### FR-1 : Inscription par email vérifié
Le coureur peut créer son accès avec une adresse email, validée par un code de vérification envoyé par mail. Un compte n'admet qu'une **session unique** : une connexion sur un nouvel appareil termine les autres.
- Un code expiré ou erroné ne crée pas de compte.
- La session unique s'applique à tous les rôles (coureur, volontaire, admin).

#### FR-2 : Formulaire d'inscription à l'édition
Le coureur peut sélectionner son épreuve (longue ou moyenne) et saisir ses informations (identité, contact, catégorie d'âge dérivée, urgence, **taille de t-shirt — requise pour la commande**).
- Les champs obligatoires bloquent la soumission incomplète.
- Les inscriptions sont closes à **J-10 de l'événement** (soit le 16/03/2027) : l'organisateur commande médailles et t-shirts sur les chiffres des dossiers validés — pas de stock d'avance.

#### FR-3 : Acceptation décharge et règlement intérieur
Le coureur doit accepter la décharge de bonne santé et le règlement intérieur pour soumettre son dossier ; l'acceptation est horodatée avec la version du document.
- Impossible de soumettre sans les deux acceptations.

#### FR-4 : Télversement de la preuve de paiement CCP
Le coureur peut téléverser une image/PDF de sa preuve de virement ; l'organisateur peut la valider ou la refuser avec motif.
- Les formats non images/PDF sont rejetés avec message clair.

#### FR-5 : Checklist de dossier self-service
Le coureur peut voir en un coup d'œil le statut de chaque pièce (email vérifié, épreuve choisie, décharge, règlement, preuve, validation organisateur).
- Chaque pièce manquante nomme l'action à faire.

#### FR-6 : Notifications de statut
Le coureur est informé par email des changements de statut de son dossier (reçu, validé, refusé avec motif).

### 4.2 E-dossard et retrait

**Description.** Dossier validé = dossard prêt. Le coureur affiche son e-dossard QR hors-ligne ; les guichets le scannent pour la remise physique (~300 en avance, ~700 le jour J). Réalise UJ-1, UJ-3.

#### FR-7 : E-dossard QR hors-ligne
Le coureur peut afficher son QR unique en haute définition sans connexion (cache ou image téléchargée).
- Le QR reste lisible après 30 jours de cache.

#### FR-8 : Scan de retrait du dossard
Le volontaire au guichet peut scanner l'e-dossard pour marquer le coureur « présent au départ », hors-ligne inclus.
- Un second scan du même coureur affiche un voyant de doublon.

### 4.3 Portail volontaires et missions

**Description.** 150–200 volontaires, importés par Excel, reçoivent une invitation à se connecter (email + code de vérification, comme tous les rôles) ; l'organisateur découpe l'édition en secteurs et y affecte des missions ; chaque volontaire a sa fiche mission offline le jour J. Le scan de checkpoint est l'une des missions. Réalise UJ-2.

#### FR-9 : Import Excel des volontaires
L'admin peut importer une liste de volontaires (nom, email, téléphone) et déclencher les invitations ; les volontaires se connectent par email + code de vérification, mécanisme d'accès unique pour tous les rôles (coureur, volontaire, organisateur).
- Les lignes invalides sont rejetées avec rapport ligne par ligne.

#### FR-10 : Secteurs et missions
L'admin peut définir des secteurs, y créer des missions typées (scan checkpoint, accueil, sécurité tronçon, sécurité arrivée, distribution dossards, communication) et y affecter des volontaires.
- Chaque mission affiche son état de couverture : couverte / vacante.
- Une affectation créant un chevauchement horaire pour un volontaire déclenche un avertissement (non bloquant).

#### FR-11 : Fiche mission hors-ligne
Le volontaire peut consulter sa mission (secteur, rôle, horaires, contacts, consignes) sans connexion ; elle est préchargée à l'affectation.
- La fiche reste disponible app fermée/réseau absent.

#### FR-12 : Préchargement de l'annuaire des coureurs
Avant le départ, les appareils des scanneurs téléchargent l'annuaire des coureurs de l'édition (dossards, identité, photo éventuelle) pour validation locale aux scans.
- Le scan d'un coureur inconnu affiche un voyant rouge explicite.

### 4.4 Chronométrage et résultats

**Description.** Scan des e-dossards aux checkpoints et à l'arrivée, horodatage local, sync par lots idempotente, classements par épreuve (départs échelonnés), résultats live sur la vitrine, gestion des abandons. Réalise UJ-2, UJ-3, UJ-4.

#### FR-13 : Scan de passage offline
Le scanneur peut enregistrer un Passage (e-dossard → checkpoint, horodatage local, validation contre l'annuaire local) sans aucun réseau ; l'interface confirme en < 1 s par coureur (bip + voyant).
- Doublon même coureur/même checkpoint : voyant rouge, Passage non dupliqué.

#### FR-14 : Sync par lots
Dès que le réseau revient, l'appareil envoie les Passages accumulés ; la sync est idempotente (rejeu sans doublon) et résout les conflits d'horodatage par appareil+checkpoint+coureur.
- Zéro Passage perdu au soir de la course (voir SM-2).
- **Dédoublonnage cross-appareils** : le **premier Passage reçu** par checkpoint compte pour le classement ; les Passages ultérieurs du même coureur au même checkpoint (autres scanneurs) sont conservés pour audit mais neutres pour le classement.

#### FR-15 : Classements et départs échelonnés
Le système produit les classements par épreuve — scratch et `[ASSUMPTION: par sexe et catégories d'âge — crédibilité fédération, à confirmer]` — en gérant des heures de départ distinctes par épreuve.
- Un coureur n'apparaît que dans le classement de son épreuve.

#### FR-16 : Résultats en direct
La vitrine affiche les classements et passages au fil de la synchronisation ; les URLs de résultats sont partageables (réseaux, presse).
- Un rafraîchissement n'expose jamais de classement partiel incohérent (ordre par temps réels).
- Les liens de résultats partagés portent un paramètre de suivi anonyme, permettant de compter la portée (SM-5) sans données personnelles.

#### FR-17 : Abandons
L'organisation (PC ou volontaires) peut saisir un abandon (coureur, lieu, motif, heure) ; le coureur sort des calculs en cours et reste dans les rapports.

### 4.5 Tracking GPS

**Description.** Opt-in du coureur à l'inscription ou dans l'espace coureur ; positions espacées (5–10 min), cache hors-ligne, envoi en rafale ; **carte publique pour tous** — coureurs identifiés par numéro de dossard uniquement — sur le tracé GPX avec checkpoints ; pédagogie batterie forte (onboarding, rappels, powerbank conseillée) ; la seule désactivation est l'arrêt du tracking lui-même. Réalise UJ-4.

#### FR-18 : Capture et envoi des positions
L'appareil du coureur peut enregistrer sa position à intervalle de 5–10 minutes en mode « précision équilibrée », la stocker en cache hors-ligne et l'envoyer en lot dès le retour du réseau.
- Le tracking désactivé n'enregistre rien.

#### FR-19 : Carte interactive publique
La vitrine affiche en continu, pour **tous les visiteurs**, la dernière position connue de chaque coureur opt-in sur le tracé GPX officiel, avec les checkpoints ; chaque coureur n'y apparaît que par son **numéro de dossard** — aucune information privée (nom, photo, contact) n'est exposée publiquement.
- Les positions plus vieilles que X heures `[ASSUMPTION: X = 1 h]` sont estompées.

#### FR-20 : Pédagogie batterie
Le parcours d'activation du tracking présente les consignes batterie (charge à 100 %, désactivation du tueur d'applications, powerbank pour la longue) avec rappel à J-7.

### 4.6 Vitrine publique

**Description.** La façade de l'édition : page course moderne « qui en jette », mention « sous l'égide de la fédération et du ministère des sports », bloc sponsors (option A unique / option B multiples sans exclusivité), infos pratiques (hébergement sur place, restauration, découverte de la région), événements annexes, résultats live. Réalise UJ-4 ; porteuse de la réputation.

#### FR-21 : Page course publique
Tout visiteur peut consulter la page de l'édition (dates, épreuves, parcours GPX, dénivelés, horaires, ravitaillements, consignes de sécurité) sans compte.
- La page affiche la mention « sous l'égide de la fédération et du ministère des sports ».
- Budget borné : premier chargement < 300 ko `[ASSUMPTION]`, premier rendu lisible en < 5 s sur 3G lent `[ASSUMPTION]`, tracé GPX en chargement différé.

#### FR-22 : Bloc sponsors
L'admin peut configurer le sponsoring retenu : option A (sponsor unique, emplacement signature) ou option B (plusieurs sponsors, sans exclusivité).
- Le basculement A→B ne nécessite aucun développement.

#### FR-23 : Infos pratiques et annexes
L'admin peut éditer les contenus pratiques (hébergement, restauration, région) et publier les événements annexes (exhibitions sportives).
- `[NOTE FOR PM: la timeline d'engagement progressive (contenus jalonnés vers J) est en Should — V1 minimal : pages statiques éditables.]`

### 4.7 Portail admin et PC course

**Description.** Le poste de commandement : tableau live, vue passages par checkpoint, alertes hors-délais, gestion des dossiers, rapports chiffrés post-course. Réalise UJ-3.

#### FR-24 : Tableau de bord live
L'admin peut suivre en direct : retraits, partants par épreuve, en course, arrivés, abandonnés, passages par checkpoint.
- Les données affichées datent de la dernière synchronisation (transparence sur la fraîcheur).

#### FR-25 : Alertes hors-délais
Le système signale les coureurs n'ayant pas franchi un checkpoint avant sa barrière horaire, ainsi que `[ASSUMPTION: la batterie sous 15 % des coureurs opt-in tracking — Should, à confirmer]`.

#### FR-26 : Rapports chiffrés post-course
L'admin peut exporter le rapport de l'édition (inscrits, présents, passages, arrivées, abandons, portée des partages) pour le bilan du directoire.
- L'export couvre l'édition complète en un fichier.
- À J-10, un export « commande » fournit les décomptes validés par épreuve et par taille de t-shirt (médailles, t-shirts — zéro stock).

### 4.8 Socle multi-organisation

**Description.** Préparation de la location d'instances post-V1 : les données sont isolées par organisation dès la V1.

#### FR-27 : Isolation des données par instance
Toutes les données sont rattachées au triplet `organisation → événement → édition` dès la V1 ; l'instance unique n'expose aucune donnée inter-organisations.
- La création d'une seconde organisation ne demande aucun changement de schéma (préparé pour la location d'instances post-V1).

## 5. Non-objectifs (explicites)

- **Gestion du sponsoring** : contractualisation hors application.
- **Dossier fédération / conformité réglementaire** : gérés hors application.
- **Passerelle de paiement en ligne** (Satim/CIB/Edahabia) : la V1 valide des preuves CCP ; la passerelle est un chantier post-2027.
- **Provisioning self-service d'instances** : le schéma prépare, la mécanique viendra.
- **Module photos/vidéo, kit presse** : parqués (Could).
- **Réseaux sociaux intégrés** : partage par liens, pas d'intégration native.
- **Écologie outillée** : assumée en V1 uniquement par la dématérialisation (e-dossard, zéro papier le jour J) ; pas de mesure dédiée.

## 6. Périmètre MVP

### 6.1 Inclus
FR-1 à FR-27, avec les nuances Should/Could suivantes : timeline d'engagement progressive, historique 1re édition et alerte batterie livrées **si le temps le permet** après le Must.

**Phasage jalons → FRs :**

| Jalon | FRs couvertes |
|---|---|
| **15/11/2026** — V1 « inscriptions » | FR-1 à FR-6 (+ page publique d'annonce, FR-21 minimale) |
| **Dry-run** avant le jour J | FR-7 à FR-14, FR-24 à FR-25 (cœur offline + PC course) |
| **26/03/2027** — jour J | Tout le Must en service (dont FR-15 à FR-23) ; FR-26 dans la semaine |

### 6.2 Exclus du MVP
- Tout le §5, plus : notifications push natives, mode hors-ligne de la vitrine, interface multilingue (V1 : **français**, confirmé).

## 7. Critères de succès

**Primaires**
- **SM-1** : Temps d'attente moyen au retrait < 5 min par coureur. Valide FR-7/FR-8.
- **SM-2** : 100 % des Passages synchronisés au plus tard le soir de la course ; zéro perdu. Valide FR-13/FR-14.
- **SM-3** : ≥ 80 % des dossiers validés sans échange humain. Valide FR-5/FR-6.
- **SM-4** : Résultats live consultables pendant la course sur la vitrine. Valide FR-16/FR-24.

**Secondaires**
- **SM-5** : Objectif de partages des résultats (cible à chiffrer avec l'organisateur). Valide FR-16.
- **SM-6** : Taux d'activation du tracking opt-in (cible à chiffrer). Valide FR-18.

**Contre-mesures (ne pas optimiser)**
- **SM-C1** : Taux de coureurs décrochant sans compléter leur dossier — le self-service ne doit pas exclure les coureurs peu à l'aise avec le numérique ; un canal d'assistance humaine doit rester visible. Contrebalance SM-3.
- **SM-C2** : Fréquence GPS — ne pas augmenter la fréquence pour embellir la carte au prix de la batterie des coureurs. Contrebalance SM-6.

## 8. Questions ouvertes

1. Nombre exact de checkpoints par épreuve et barrières horaires. (FR-13, FR-25)
2. Classements par sexe et catégories d'âge : confirmer. (FR-15)
3. Données de la 1re édition : existence, format, intégration. (Should)
4. Inscription sur place : quel volume de coureurs sans email/smartphone attend-on, et quel repli manuel organiser (papier, inscription au guichet par un volontaire équipé) ? **À trancher avec l'organisateur avant le 15/11/2026.**

## 9. Index des hypothèses

- §2.2 — Coureurs sans email/smartphone exclus de la V1 (inscription sur place non traitée).
- §3 — Checkpoints : 4 (longue) / 1–2 (moyenne).
- §3 — Barrières horaires définies par l'organisateur avant course.
- FR-15 — Classements par sexe et catégories d'âge.
- FR-19 — Positions plus vieilles que 1 h estompées.
- FR-21 — Premier chargement < 300 ko ; rendu < 5 s sur 3G lent.
- FR-25 — Alerte batterie < 15 % (Should).
