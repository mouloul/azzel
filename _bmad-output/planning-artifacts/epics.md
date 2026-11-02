---
status: final
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - 2026-11-02 extension epopees 9-10-11 (step-01 a step-03)
inputDocuments:
  - ../prds/prd-Azzel-2026-10-19/prd.md
  - ../architecture/architecture-Azzel-2026-10-19/ARCHITECTURE-SPINE.md
  - ../ux-designs/ux-Azzel-2026-10-20/DESIGN.md
  - ../ux-designs/ux-Azzel-2026-10-20/EXPERIENCE.md
  - ../../brainstorming/brainstorm-carte-3d-parcours-course-2026-10-23/brainstorm-intent.md
  - ../../brainstorming/brainstorm-carte-3d-parcours-course-2026-10-23/note-licences-cartographiques.md
  - ../../brainstorming/brainstorm-carte-3d-parcours-course-2026-10-23/poc/
  - ../../implementation-artifacts/note-archi-winston-deploiement-vercel.md
  - ../../implementation-artifacts/maquettes-refonte-design-2026-11-02.md
---

# Azzel - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Azzel, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: Inscription par email vérifié (code à usage) ; session unique par compte, tous rôles ; code expiré/erroné ne crée pas de compte.
FR-2: Formulaire d'inscription à l'édition (épreuve longue/moyenne, identité, urgence, taille de t-shirt requise) ; champs obligatoires bloquants ; clôture J-10 (16/03/2027).
FR-3: Acceptation décharge + règlement intérieur obligatoire, horodatée avec version du document.
FR-4: Télversement preuve de paiement CCP (image/PDF) ; validation/refus organisateur avec motif ; formats non conformes rejetés avec message clair.
FR-5: Checklist dossier self-service — statut de chaque pièce ; chaque pièce manquante nomme l'action à faire.
FR-6: Notifications de statut par email (reçu, validé, refusé avec motif).
FR-7: E-dossard QR hors-ligne haute définition, lisible après 30 jours de cache.
FR-8: Scan de retrait du dossard au guichet (marque « présent au départ », hors-ligne inclus) ; doublon = voyant.
FR-9: Import Excel volontaires (nom, email, téléphone) + invitations ; connexion par email + code de vérification (mécanisme unique tous rôles) ; rapport ligne par ligne des rejets.
FR-10: Secteurs et missions typées (scan checkpoint, accueil, sécurité tronçon, sécurité arrivée, distribution dossards, communication) ; état couverte/vacante ; avertissement de chevauchement horaire (non bloquant).
FR-11: Fiche mission hors-ligne (secteur, rôle, horaires, contacts, consignes) préchargée à l'affectation, disponible app fermée/réseau absent.
FR-12: Préchargement de l'annuaire des coureurs de l'édition dans les appareils scanneurs ; scan d'un coureur inconnu = voyant rouge explicite.
FR-13: Scan de passage offline (e-dossard → checkpoint, horodatage local, validation contre annuaire local) ; confirmation < 1 s (bip + voyant) ; doublon même coureur/checkpoint = voyant rouge, Passage non dupliqué.
FR-14: Sync par lots idempotente au retour du réseau (clé appareil+checkpoint+coureur) ; zéro Passage perdu au soir ; dédoublonnage cross-appareils : premier Passage reçu par checkpoint compte, suivants archivés pour audit.
FR-15: Classements par épreuve (scratch ; sexe/catégories d'âge `[ASSUMPTION: à confirmer]`) avec départs échelonnés ; un coureur n'apparaît que dans son épreuve.
FR-16: Résultats en direct sur la vitrine ; URLs partageables ; jamais de classement partiel incohérent ; paramètre de suivi anonyme (SM-5).
FR-17: Saisie des abandons (coureur, lieu, motif, heure) ; le coureur sort des calculs en cours, reste dans les rapports.
FR-18: Capture et envoi des positions opt-in (5–10 min, précision équilibrée), cache hors-ligne, envoi en lot au retour réseau ; tracking désactivé n'enregistre rien.
FR-19: Carte interactive publique — dernière position connue des coureurs opt-in sur tracé GPX + checkpoints ; identification par numéro de dossard uniquement ; positions > 1 h `[ASSUMPTION]` estompées.
FR-20: Pédagogie batterie (charge 100 %, tueur d'applications, powerbank) avec rappel J-7.
FR-21: Page course publique sans compte (dates, épreuves, parcours GPX, dénivelés, horaires, ravitaillements, consignes sécurité) ; mention « sous l'égide de la fédération et du ministère des sports » ; budget < 300 Ko / rendu < 5 s en 3G / GPX différé `[ASSUMPTION sur seuils]`.
FR-22: Bloc sponsors configurable option A (unique, signature) / option B (multiples, sans exclusivité) ; bascule sans dev.
FR-23: Infos pratiques et annexes éditables par l'admin (hébergement, restauration, région, événements annexes).
FR-24: Tableau de bord live admin : retraits, partants par épreuve, en course, arrivés, abandonnés, passages par checkpoint ; fraîcheur = dernière sync, affichée.
FR-25: Alertes hors-délais (barrière horaire non franchie) `[ASSUMPTION: + batterie < 15 % — Should]`.
FR-26: Rapports chiffrés post-course (inscrits, présents, passages, arrivées, abandons, portée partages) en un fichier ; export « commande » à J-10 (décomptes par épreuve et taille de t-shirt).
FR-27: Isolation des données par organisation (triplet organisation → événement → édition) dès la V1 ; seconde organisation sans changement de schéma.

<!-- Extension épopée 8 — carte 3D du parcours (source : brainstorm 2026-10-23, périmètre MUST + SHOULD) -->

FR-28: Pipeline build-time GPX → `parcours.json` — entrée : export GPX **manuel** de la trace relevée (montre Garmin → Garmin Connect ou Strava), altitude barométrique embarquée dans le fichier. Traitements : rejet des points à vitesse implausible (le relevé d'essai contient un téléport de 366 m en 1 s), lissage du bruit, distances cumulées (`s`), altitude **lue dans le GPX** (aucun échantillonnage du MNT), D+/D− global et par segment inter-checkpoint. Le **seuil d'accumulation du D+ est fixé une fois pour toutes dans le pipeline** et documenté : sur le relevé d'essai, le D+ varie de 641 m (brut) à 604 m (seuil 5 m), soit 6 % d'écart selon une constante arbitraire.
FR-28b: Porte de qualité du relevé — le pipeline refuse ou signale explicitement une trace hors seuils de recevabilité (pas médian entre points, part de la distance couverte par des segments > 30 s, nombre de points à vitesse implausible) et nomme le défaut. Deux relevés de référence encadrent les seuils : `activity_24827718657.gpx` **inexploitable** (598 points sur 20,47 km, 69 % de la distance en segments > 30 s, jusqu'à 483 s entre deux points) et `activity_24920331005.gpx` **exploitable** (26 933 points sur 30,68 km, pas médian 1 s, aucun segment > 30 s, boucle fermée à 18 m).
FR-29: Carte 3D du parcours sur la vitrine — moteur MapLibre GL JS, relief terrarium (`setTerrain`), tracé officiel, marqueurs de checkpoints cliquables (nom, km, altitude, D+ du segment, services).
FR-30: Profil altimétrique du parcours — couples `(s, altitude)` issus de `parcours.json`, checkpoints positionnés, services et bornes de segment (km + D+) lisibles.
FR-31: Synchronisation profil ↔ carte par l'abscisse curviligne `s` — curseur partagé bidirectionnel (survol/tap sur le profil déplace le repère sur la carte, et réciproquement) ; `s` est l'unique variable d'état partagée.
FR-32: Attributions cartographiques affichées en permanence et adaptées au fond actif (relief USGS/Mapzen toujours, OpenTopoMap CC-BY-SA, fond satellite retenu, MapLibre) ; texte conforme à la note licences §5.
FR-33: Arbitrage du fond satellite de production — source retenue compatible avec l'usage réel d'Azzel (inscriptions payantes FR-4 + sponsors visibles FR-22), décision tracée et mise en œuvre ; les endpoints Esri sans clé du POC ne partent pas en production.
FR-34: Survol animé du parcours (Should) — caméra paramétrée par `s`, démarrage/arrêt explicites, neutralisé sous `prefers-reduced-motion`.
FR-35: Exagération verticale paramétrable x1,5–2 et bascule 3D on/off (Should) — `setTerrain(null)` rend une carte 2D fonctionnelle.
FR-36: Bandeau profil repliable (Should) — en-tête cliquable, résumé km / D+ / nombre de points quand replié, carte seule en plein écran, redimensionnement correct au basculement.
FR-37: Barrières horaires sur le parcours (Should) — heure limite par checkpoint, visible sur le profil et sur la fiche de checkpoint.
FR-38: Deux épreuves sur géométrie partagée — départ et arrivée communs, le parcours court reprend une partie du tracé long. Modèle : une **géométrie de base** (portions de sentier relevées une fois), chaque **épreuve** étant une composition ordonnée de portions ; **`s` est calculé par épreuve**, jamais globalement. `parcours.json` porte la géométrie une seule fois et les deux vues d'épreuve. Sélecteur d'épreuve sur la page course : carte et profil basculent ensemble.
FR-39: Checkpoints de l'édition positionnés sur la trace — un checkpoint a une **identité unique sur la géométrie de base** (c'est elle qui est partagée avec l'entité CHECKPOINT de l'épopée 4) et porte un **`km` distinct par épreuve traversée**, ainsi que ses services. Les checkpoints du POC sont sans valeur et ne sont pas repris.

### NonFunctional Requirements

NFR-1: Performance scan — confirmation < 1 s par coureur, qualifiée sur le fallback iOS Safari (@zxing/browser).
NFR-2: Performance vitrine — premier chargement < 300 Ko, premier rendu lisible < 5 s sur 3G lent, tracé GPX en chargement différé.
NFR-3: Fiabilité sync — 100 % des Passages synchronisés au soir de la course, zéro perdu (SM-2) ; sync idempotente.
NFR-4: Intégrité classements — un rafraîchissement n'expose jamais de classement partiel incohérent.
NFR-5: Transparence fraîcheur — toute donnée live affiche sa fraîcheur (« synchronisé il y a X min »).
NFR-6: Durabilité e-dossard — QR lisible après 30 jours de cache, sans réseau.
NFR-7: Vie privée canaux publics — identifiants exposés : numéro de dossard qualifié par édition et position ; jamais nom, contact, photo.
NFR-8: Offline-first radical — aucune fonction critique ne dépend du réseau (scan, fiche mission, e-dossard, positions).
NFR-9: Sécurité auth — session interactive unique par compte (tous rôles) ; jeton d'appareil dédié au canal sync, révocable séparément ; limitation de rythme sur l'envoi des codes.
NFR-10: Budget d'exploitation proche de zéro — free tier Supabase (Postgres 500 Mo, storage 1 Go, realtime 200 conn./2 M msgs/mois), VPS + Coolify, SMTP custom.
NFR-11: Accessibilité — contrastes AA+ dans les deux modes, frappe ≥ 15 px sur contenus critiques, cibles ≥ 48 dp/44 pt, zoom 200 %, prefers-reduced-motion, jamais la couleur seule.
NFR-12: Langue — UI en français, code et identifiants en anglais.

<!-- Extension épopée 8 -->

NFR-13: Budget vitrine préservé — la carte 3D vit sur une **route dédiée** ou derrière une action explicite de l'utilisateur, jamais dans le flux de la page course ; MapLibre, tuiles et `parcours.json` ne sont jamais dans le chemin critique. NFR-2 (< 300 Ko au premier chargement, premier rendu lisible < 5 s en 3G lente) reste vrai sur la page course, **mesuré en CI et non déclaré**.
NFR-14: Crédibilité du dénivelé — D+/D− issus de la **trace relevée** (altimètre barométrique), méthode de calcul tracée et constante (altitude brute du GPX ou correction d'altitude Strava — à trancher, les deux donnent des chiffres différents), seuil d'accumulation fixe. Chiffre unique publié sur toutes les surfaces : carte, profil et contenu éditorial de la page course lisent la même source `parcours.json`.
NFR-15: Conformité des sources cartographiques — aucune source dont les conditions d'usage ne couvrent pas la situation réelle d'Azzel ; aucun téléchargement massif de tuiles depuis les serveurs publics tiers (OpenTopoMap notamment) ; attributions obligatoires jamais masquées.
NFR-16: Dégradation propre — absence de WebGL, GPU indisponible ou tuiles injoignables ne cassent jamais la page course : le contenu parcours (km, D+, checkpoints, services) reste lisible sans la carte.
NFR-17: Qualité du relevé terrain (prérequis non logiciel) — le relevé officiel se fait en **enregistrement à 1 seconde**, pas en enregistrement intelligent : réglé par défaut sur intelligent, le relevé d'essai rend 69 % du tracé interpolé en ligne droite entre deux points, ce qui coupe les lacets, sous-estime la distance et écrase les oscillations d'altitude. Sous couvert forestier (Akfadou, chêne-liège) le bruit horizontal monte : prévoir **plusieurs relevés de la même portion**, retenir le meilleur ou le médian, documenter l'écart entre relevés. Le relevé officiel doit **fermer la boucle** (départ = arrivée), ce que le relevé d'essai ne fait pas (947 m d'écart).

### Additional Requirements

- **Structural Seed (scaffold du premier commit)** : monorepo pnpm `apps/web` (Next.js 16.4.2), `apps/runners` (Expo SDK 58 / RN 0.88, dev build — pas Expo Go), `packages/shared` (types domaine, client sync, validation, constantes) — le monorepo et `shared` existent dès le premier commit.
- Stack verrouillée : Node ^22.13 || ^24.3 || ≥26 ; React 19.3.x unique workspace ; @zxing/browser 0.2.1 (fallback QR toujours actif sur iOS) ; Supabase cloud free tier ; auto-hébergement Next.js + reverse proxy (Coolify ou équiv.).
- ER aux frontières verrouillées : ORGANISATION → EVENEMENT → EDITION → EPREUVE/COUREUR/SECTEUR → MISSION/VOLONTAIRE ; COUREUR → PASSAGE (horodaté par CHECKPOINT) / POSITION ; COMPTE → SESSION ; `organisation_id` sur chaque table métier (RLS Postgres).
- Modules : `inscriptions`, `chrono`, `missions`, `tracking`, `vitrine`, `admin`, `iam` (Capability → Architecture Map).
- AD-2 : outbox append-only locale (IndexedDB web / SQLite natif) + lots idempotents ; « l'appareil propose, le serveur dispose ».
- AD-3 : arbitrage serveur — premier Passage reçu par checkpoint fait foi, suivants archivés (audit), neutres classement ; heures de départ officielles côté serveur ; scan au départ = contrôle de présence, jamais référence horaire de classement.
- AD-5 : session unique + jeton d'appareil (« la boîte d'envoi ne meurt jamais d'une connexion ouverte ailleurs ») ; mécanisme auth précis (Supabase Auth vs jetons maison) décidé à l'implémentation du module `iam`.
- AD-7 : canaux publics via backend Next.js (cache + SSE/polling) — jamais de lecture directe Supabase realtime depuis les navigateurs publics ; realtime réservé au portail admin.
- AD-8 : le QR encode un jeton unique édition (pas le dossard nu), résolu via annuaire répliqué ; correction d'un Passage erroné uniquement par annulation auditable côté admin.
- Emails : code UUID à expiration courte, limitation de rythme, file d'envoi avec rejeu (notifications FR-6, rappel J-7, invitations volontaires).
- Fichiers preuves : compression/redimensionnement côté client avant upload, cible ≤ 300 Ko l'unité.
- Conventions transverses : enveloppe d'erreur unique définie dans `shared` ; horodatages ISO 8601 UTC stockés, affichage local ; journal sync (lots, rejets, offsets horloge).
- Séquencement : 15/11/2026 → module `inscriptions` + vitrine minimale ; dry-run → cœur offline + PC ; 26/03/2027 → tout le Must.

<!-- Extension épopée 8 — décisions arrêtées en session de brainstorming du 23/10/2026 -->

- **Stack de rendu verrouillée** : MapLibre GL JS 4.7.1 (CDN cdnjs, BSD 3-Clause) ; relief AWS Terrain Tiles encodage `terrarium` (`raster-dem`, tileSize 256, maxzoom 15, domaine public SRTM/GMTED) ; fond topo OpenTopoMap (maxzoom 17, CC-BY-SA) ; glyphes `fonts.openmaptiles.org`. Arbitrage tranché contre l'alternative « ruban mesh extrudé .glb sous three.js » : la 3D visée est du terrain tuilé complet.
- **`s` (abscisse curviligne) est le bus d'état unique** de toutes les surfaces parcours : profil `(s, altitude)`, checkpoints, future position live (projection des scans épopée 4 et des pings GPS épopée 6), caméra du survol animé, et tout fallback 2D. La 3D est un bonus ; `(s, altitude)` est le socle. **`s` est relatif à une épreuve** (cf. FR-38) : la géométrie de base est partagée, l'abscisse ne l'est pas.
- **Pipeline build-time, jamais runtime** : entrée GPX réel exporté à la main, sortie `parcours.json` (géométrie de base, vues d'épreuve, `profile[[dist_m,alt]]`, `checkpoints[]`, métadonnées) consommée à l'identique par la carte et le profil.
- **Source de la trace : export manuel, jamais l'API.** La trace vient d'une montre Garmin (altimètre barométrique) relevée sur le terrain, récupérée via Garmin Connect ou Strava (abonnement pro). Le fichier GPX est **exporté à la main et versionné dans le dépôt** : aucune intégration des API Strava ou Garmin, qui ajouterait une dépendance de jeton et replacerait le projet sous leurs conditions d'usage. L'interdiction Strava porte sur les traces d'autrui et ne concerne pas un relevé dont l'organisation est propriétaire.
- **Le MNT ne sert plus qu'au rendu.** L'altitude du profil est lue dans le GPX ; le relief terrarium n'intervient que pour le terrain 3D affiché sous la trace. `dem.py` et l'échantillonnage MNT du POC sortent du pipeline de production, conservés au mieux en contrôle croisé hors CI.
- **Trace gelée à la publication** : une fois le parcours annoncé publiquement, le tracé ne change plus ; toute évolution ultérieure est une nouvelle version explicite de `parcours.json`, jamais une modification silencieuse.
- **MapLibre ne peut pas servir de mode hors-ligne par préchargement de tuiles** (interdiction de téléchargement massif). Le hors-ligne 3D de l'app coureur passera par le ruban .glb Draco — reporté à l'épopée 6, hors périmètre ici.
- **Statut du POC : `poc/index.html` est le modèle d'intégration de la carte**, à reprendre tel quel dans la vitrine (carte MapLibre, bascules satellite/topo et 3D, profil SVG synchronisé, curseur partagé, bandeau repliable). Il tourne désormais sur le relevé réel `activity_24920331005.gpx` et non plus sur des points fictifs ; ses **checkpoints restent arbitraires** (« Point 1 » à « Point 3 », posés tous les 7 km) et ne préjugent pas des ravitaillements réels. Motifs acquis et réutilisables : `poc/index.html` (carte MapLibre, bascules satellite/topo et 3D, profil SVG synchronisé, curseur partagé, bandeau repliable). `poc/route.py` et `poc/dem.py` sont périmés en production (cf. source de la trace ci-dessus).
- **Relevés d'essai disponibles** : `docs/GPX/activity_24920331005.gpx` (« essai trail ait ainsi 2027 », Garmin Connect, 2026-10-31) — 26 933 points, 30,68 km, 8 h 14, altitude 221–837 m, D+ 1 459 m / D− 1 462 m brut, **pas médian 1 s, aucun segment > 30 s, boucle fermée (18 m)**. C'est ce relevé qui alimente désormais le POC (`parcours.json` : 28,0 km, D+ 1 280 m, 5 points de passage) et les maquettes. Le premier relevé `docs/GPX/activity_24827718657.gpx` (598 points, 20,47 km, enregistrement intelligent) reste au dépôt comme **contre-exemple** de la porte de qualité FR-28b. Ni l'un ni l'autre n'est le tracé officiel : le découpage des deux épreuves sur cette géométrie reste à arrêter.
- **Position live sur la carte 3D : hors périmètre** (WON'T de cette itération). Cadrage déjà arrêté pour plus tard — fusion scans checkpoints + ping GPS 10 min, point figé sur le dernier `s` connu avec « vu il y a X min », aucune extrapolation inter-ping.
- **Questions ouvertes d'architecture** : lieu d'exécution du pipeline (script Python hors CI vs script Node en build web) ; versionnement de `parcours.json` par édition ; altitude brute du GPX vs correction d'altitude Strava, et seuil d'accumulation du D+ ; ordre d'enchaînement des boucles sur l'épreuve longue (le pipeline doit supporter les deux cas) ; valeur par défaut de l'exagération verticale dans la plage x1,5–2 ; modélisation des barrières horaires (rattachement aux checkpoints de l'épopée 4 ou entité propre).
- **Hors périmètre, à arbitrer plus tard** : la carte publique livrée en story 7.3 affiche les dossards sur **un** tracé ; avec deux épreuves partageant une portion, elle devra filtrer par épreuve ou superposer les deux. L'information existe déjà (le dossard porte son épreuve, FR-2/FR-15), l'affichage n'a pas été conçu pour.
- **Point de vigilance licences (bloquant)** : la note licences §3 conditionne EOX Sentinel-2 cloudless (CC BY-NC-SA) au caractère strictement non monétisé du projet, et rouvre la question dès qu'apparaissent des inscriptions payantes **ou** des sponsors visibles. Azzel a déjà les deux (FR-4 preuve de paiement CCP, FR-22 bloc sponsors). L'arbitrage du fond satellite se joue donc entre ArcGIS Location Platform avec clé (même imagerie que le POC, palier gratuit 2 M tuiles/mois, cadre contractuel explicite), un fournisseur payant (MapTiler / Mapbox), ou OpenTopoMap seul sans fond satellite.

### UX Design Requirements

UX-DR-1: Système de design tokens « Vert Djurdjura » — implémenter les tokens du frontmatter DESIGN.md (colors clair/sombre incl. 5 opérationnelles jour J avec encres, typography humaniste arrondie + mono meta 12 px / meta-lg 15 px / dossard 74 px, rounded 8/16/24/full, spacing 4–48) comme source unique (CSS vars web + theme RN).
UX-DR-2: Mode sombre optionnel partout — défaut préférence système, override mémorisé, bascule visible dans l'en-tête de chaque surface ; opérationnelles inversées testées.
UX-DR-3: Frise kabyle SVG monochrome sapin — seuils en tête/pied (vitrine, e-dossard), décorative, aria-hidden, jamais derrière du texte.
UX-DR-4: Glyphes piliers inline amazighs (ⵣ Yaz sport, tala santé, tabzimt citoyenneté, ingel écologie) — 20–24 px SVG discrets sur la vitrine ; jamais mascotte ni logo politique/sacré.
UX-DR-5: Citations kabyles aux points d'usage uniquement (batterie « Un point après l'autre… », départ/fin « Il franchit les cols… », ravitaillements « Aman d laman ») avec source Hanoteau 1867 — jamais groupées en section, jamais en zone critique.
UX-DR-6: Caméra scan plein écran PWA — viseur plein cadre, badges LIVE + heure sur voile ≥ 96 %, mission en cours en voile haut, dernier scan en pastille ; audio débloqué au tap « Démarrer le scan », vibration en 3e canal, deux mélodies distinctes doublon/inconnu.
UX-DR-7: Voyant scan — pill ≥ 96 px de haut plein cadre, texte ≥ 24 px graisse 800, heure mono ≥ 16 px ; succès / ↻ DÉJÀ PASSÉ (+ heure du premier passage) / ⚠ DOSSARD INCONNU (+ bouton appel PC direct) ; clignotement ≤ 1 flash/s ; aria-live assertive.
UX-DR-8: Bandeau sync visible — « ◷ N passages en attente » → « ✓ envoyés — file : 0 » + Journal sync en lecture seule (lots, rejets, offsets horloge).
UX-DR-9: E-dossard — carte sombre, numéro 74 px, « HORS-LIGNE PRÊT » mono, QR sur carte blanche coins 16 px, raccourci système recommandé (un geste écran verrouillé).
UX-DR-10: Checklist dossier — compteur de pièces, puce verte/lien action par pièce manquante, tout vert → bandeau « Dossier validé — dossard prêt », assistance visible.
UX-DR-11: Bouton assistance SM-C1 « Appeler l'équipe » — obligatoire dans l'enveloppe d'erreur, l'email de refus, la checklist incomplète, la vitrine (infos pratiques).
UX-DR-12: Tableau de bord live + lignes de board — agrégats par checkpoint, badge dossard mono, heure mono 15 px alignée droite, séparateurs pointillés, fraîcheur en pied, realtime sans flash complet ; alerte hors-délais clignotante (≥ 1 s de période) avec texte intégral + actions « Appeler le secteur » / « Saisir l'abandon ».
UX-DR-13: Carte publique — tracé GPX différé, checkpoints marqués, pastilles dossards anonymes, estompage > 1 h, « dernière position connue » affichée comme telle.
UX-DR-14: Vitrine « qui en jette » sans images lourdes — hero typographique + SVG/dégradés, une seule couleur de marque (sapin), bandeau égide toujours visible, bloc sponsors option A/B sans dev.
UX-DR-15: Vidéo trailer 1ʳᵉ édition (Should) — poster léger + lecture à la demande, jamais dans le chemin critique ; témoignages coureurs (Should) ; galerie photos lazy-load (Could).
UX-DR-16: Guide permission iOS « Autoriser une fois » — écran dédié chemin Réglages complet + bouton « Ouvrir les Réglages » ; permission refusée = suivi silencieusement inactif, aucune culpabilisation.
UX-DR-17: Pédagogie batterie — carte à puces concrètes + citation kabyle + rappel J-7 (email) ; alerte < 15 % (Should).
UX-DR-18: État permission caméra refusée/indisponible (PWA scan) — détection au premier lancement, écran dédié « Autoriser la caméra » avec chemin Réglages + assistance PC.
UX-DR-19: Saisie code email — champ unique inputmode numeric + autocomplete one-time-code, collage autorisé, validité affichée, renvoi avec compte à rebours ; code erroné/expiré = message clair sans création de compte.
UX-DR-20: Télversement preuve CCP — compression côté client ≤ 300 Ko avec feedback, rejet des formats avec message listant les formats acceptés, retry idempotent sans re-sélection, brouillon conservé, erreur doublée de l'assistance.
UX-DR-21: Enveloppe d'erreur unique — message homogène + action à faire, jamais de code brut, numéro d'assistance inclus.
UX-DR-22: Voice & Tone — tutoiement coureur/volontaire, sobre vitrine/admin ; libellés verbatim de la spine (ex. « HORS-LIGNE PRÊT — ton dossard marche sans réseau », « Classement provisoire — synchronisé il y a 3 min »).
UX-DR-23: Accessibility floor complet — focus visible 2 px action/action-sombre, zoom navigateur 200 % testé / pinch jamais désactivé, gap ≥ 8 px entre cibles, aucune action critique au bord, pause/stop scan ≥ 64 dp, icônes labellisées, décorations aria-hidden, reduced-motion → statique.
UX-DR-24: Responsive & plateforme — vitrine mobile-first une colonne (display réduit), app/PWA une colonne gros éléments tactiles, Android entrée de gamme (aucune dépendance au survol, motion dosé), iOS Safari PWA, écrans hétérogènes.

<!-- Extension épopée 8 -->

UX-DR-25: Carte 3D du parcours — contrôles discrets et labellisés (bascule 3D on/off, exagération verticale, bascule satellite/topo), `NavigationControl({visualizePitch:true})`, cibles ≥ 44/48 jamais au bord de l'écran ; la carte n'occupe jamais le premier écran de la page course.
UX-DR-26: Marqueurs de checkpoints — pastille numérotée sur la trace, popup au tap et au clavier (nom, km, altitude, D+ du segment amont, services : chrono / eau / solide / médical / bus / repas / wc), services en icône **et** en texte, jamais la couleur seule.
UX-DR-27: Profil altimétrique — SVG lisible mobile-first, checkpoints repérés, lecture au survol **et** au tap (pas de dépendance au survol, Android entrée de gamme), curseur partagé avec la carte, valeurs km/alt annoncées en texte accessible.
UX-DR-28: Bandeau profil repliable — en-tête cliquable, résumé km / D+ / nombre de points quand replié, état mémorisé, carte redimensionnée correctement au basculement.
UX-DR-29: Bloc d'attributions — permanent, lisible (contraste AA+), jamais superposé à du contenu, texte exact par source active ; déploiement d'un détail possible mais la mention courte reste toujours visible.
UX-DR-30: Dégradation et motion — sans WebGL ou tuiles injoignables, un bloc parcours textuel complet remplace la carte avec un message clair ; `prefers-reduced-motion` neutralise le survol animé et les transitions de caméra ; aucun mouvement automatique non demandé.
UX-DR-31: Épreuve active toujours qualifiée — sur la portion commune, un même checkpoint affiche un kilomètre différent selon l'épreuve ; l'épreuve active reste donc visible en permanence au contact du kilométrage, sur la carte comme sur le profil. Basculer d'épreuve ne laisse jamais un chiffre orphelin de son référentiel, et la bascule se lit comme voulue, jamais comme un défaut.

<!-- Extension épopée 9 — refonte du design de l'application (source : maquettes du 2026-11-02) -->

UX-DR-32: Vocabulaire de forme unifié et modernisé — actions et chips en pilule (rayon plein), cartes 14–20 px, fin du mélange 4/6/8 px hérité ; le même vocabulaire sur les quatre surfaces (vitrine, PWA volontaires, app coureurs, back-office).
UX-DR-33: Hero d'accueil sombre plein cadre — dégradé radial forêt, silhouette de crête en deux plans (SVG, aucune image bitmap), titre condensé très grande échelle (≈136 px desktop, fluide jusqu'au mobile), accent ocre sur le nom de l'événement, rail de chiffres clés cloisonné (épreuves, D+, altitude, places) à droite du titre.
UX-DR-34: Bande bilan compacte — les chiffres de l'édition précédente tiennent sur une bande horizontale fond forêt, et non plus sur une section pleine hauteur de cartes.
UX-DR-35: Section parcours sur la page d'accueil — sélecteur d'épreuve (Longue / Moyenne) pilotant **ensemble** carte, profil, synthèse chiffrée et liste des points de passage ; l'épreuve active est l'unique état partagé de la section, en cohérence avec UX-DR-31.
UX-DR-36: Graphe de technicité du parcours — profil altimétrique coloré par pente, échelle verrouillée : < 5 % roulant, 5–12 % soutenu, 12–20 % raide, > 20 % très raide ; légende en trait **et** en texte, jamais la couleur seule ; les quatre teintes diffèrent aussi en clarté.
UX-DR-37: Panneau carte 3D intégré à la page — barre de contrôles en chips labellisés (bascule 3D, survol, exagération du relief, fond), mention de la source du relief, indication explicite de l'interaction (glisser pour pivoter, molette pour zoomer), hauteur contenue : la carte ne prend jamais le premier écran (UX-DR-25).
UX-DR-38: Colonne de synthèse d'épreuve — distance, D+, D−, plage d'altitude, heure de départ et barrière horaire en chiffres monospace alignés, suivies de la liste des points de passage avec leurs services en toutes lettres.
UX-DR-39: Convergence des feuilles de style — les 14 feuilles CSS actuelles d'`apps/web` (1 485 lignes de `globals.css`, 446 de `volontaires.css`, 273 de `scan.css`, etc.) convergent vers un socle commun de classes sémantiques : en-tête de surface, pastille d'état, barre de navigation basse, tableau dense, carte. Aucune surface ne redéfinit localement une valeur de token.
UX-DR-40: Non-régression performance — budget vitrine < 300 Ko au premier chargement et premier rendu lisible < 5 s en 3G lent (NFR-2) tenus **malgré** le hero refondu et la section parcours ; carte 3D et profil chargés hors chemin critique, après le contenu textuel.
UX-DR-41: Non-régression accessibilité — le plancher UX-DR-23 est reconduit écran par écran sur tout ce qui est refondu : focus visible 2 px, cibles ≥ 44 px jamais au bord, contrastes AA y compris sur les libellés gris, `prefers-reduced-motion` neutralisant les transitions, zoom 200 % sans perte.

### FR Coverage Map

FR-1: Épopée 1 — Inscription email vérifié + session unique (iam)
FR-2: Épopée 1 — Formulaire d'inscription à l'édition, clôture J-10
FR-3: Épopée 1 — Décharge + règlement horodatés avec version
FR-4: Épopée 1 — Télversement preuve CCP, validation/refus avec motif
FR-5: Épopée 1 — Checklist dossier self-service
FR-6: Épopée 1 — Notifications de statut par email
FR-7: Épopée 4 — E-dossard QR hors-ligne (30 jours de cache)
FR-8: Épopée 4 — Scan de retrait, voyant doublon
FR-9: Épopée 3 — Import Excel volontaires + invitations
FR-10: Épopée 3 — Secteurs et missions, couverture, chevauchements
FR-11: Épopée 3 — Fiche mission hors-ligne
FR-12: Épopée 3 — Préchargement annuaire coureurs
FR-13: Épopée 4 — Scan de passage offline < 1 s
FR-14: Épopée 4 — Sync par lots idempotente, dédoublonnage cross-appareils
FR-15: Épopée 7 — Classements par épreuve, départs échelonnés
FR-16: Épopée 7 — Résultats en direct partageables, suivi anonyme
FR-17: Épopée 5 — Saisie des abandons (PC)
FR-18: Épopée 6 — Capture et envoi des positions opt-in
FR-19: Épopée 7 — Carte interactive publique anonyme (GPX, estompage)
FR-20: Épopée 6 — Pédagogie batterie + rappel J-7
FR-21: Épopée 2 — Page course publique < 300 Ko, égide
FR-22: Épopée 2 — Bloc sponsors option A/B sans dev
FR-23: Épopée 2 — Infos pratiques et annexes éditables
FR-24: Épopée 5 — Tableau de bord live, fraîcheur affichée
FR-25: Épopée 5 — Alertes hors-délais
FR-26: Épopée 7 — Rapports post-course + export « commande » J-10
FR-27: Épopée 1 — Schéma organisation_id + RLS dès la V1
FR-28: Épopée 11 — Pipeline build-time GPX → parcours.json (lissage, s, D+/D−)
FR-28b: Épopée 11 — Porte de qualité du relevé, défaut nommé
FR-29: Épopée 11 — Carte 3D MapLibre, relief terrarium, checkpoints cliquables
FR-30: Épopée 11 — Profil altimétrique et graphe de technicité
FR-31: Épopée 11 — Curseur partagé carte ↔ profil par l'abscisse s
FR-32: Épopée 11 — Attributions permanentes, adaptées au fond actif
FR-33: Épopée 11 — Arbitrage du fond cartographique de production (bloquant)
FR-34: Épopée 11 — Survol animé du parcours (Should)
FR-35: Épopée 11 — Exagération verticale et bascule 3D on/off (Should)
FR-36: Épopée 11 — Bandeau profil repliable (Should)
FR-37: Épopée 11 — Barrières horaires sur le parcours (Should, dépendance CHECKPOINT épopée 4)
FR-38: Épopée 11 — Deux épreuves sur géométrie partagée, s par épreuve
FR-39: Épopée 11 — Checkpoints de l'édition positionnés sur la trace, km par épreuve

### Décisions de découpage (2026-11-02)

- **Axe retenu : calendaire.** La refonte est scindée selon l'horizon de livraison — surface publique (épopée 9) contre outils du jour J (épopée 10) — et non selon la nature du travail. Le parcours 3D reste une épopée propre (11) parce que son fond cartographique porte un arbitrage de licence bloquant : le fondre dans la refonte prendrait celle-ci en otage.
- **Stories 2.1 et 2.2 remplacées en habillage.** `spec-2-1-page-d-annonce-publique-minimale.md` et `spec-2-2-identite-village-piliers-frises-sombre.md` gardent leur statut et leurs critères d'acceptation, qui restent exigibles et sont repris dans les stories 9.2 et 9.3. Seul l'habillage est remplacé.
- **Risque assumé.** Les épopées 9 et 10 refondent des écrans livrés par 36 stories en statut `review`, dont la recette humaine n'a pas été passée. Le markup sur lequel portent les tests existants et les scénarios de recette non joués sera réécrit : la preuve de ce qui n'a jamais été vérifié disparaît avec lui. Décision prise en connaissance de cause le 2026-11-02 ; les documents `scenarios-recette-epic-*.md` devront être réalignés après refonte.
- **Échéance.** Aucune story n'est calée sur le jalon du 15/11/2026 du PRD, faute d'arbitrage sur sa validité.

## Epic List

#### Epic 8: Environnement de recette hébergé
Épopée technique, hors périmètre produit : `apps/web` est mis en ligne sur une URL stable pour que le comité d'organisation prenne l'application en main avant le jour J. Données entièrement fictives, le comité s'authentifie dans l'application comme n'importe quel utilisateur. Suppose une fabrique de connexion unique compatible pooler, le stockage des preuves hors disque local, un jeu de données d'édition complète régénérable et un expéditeur email qui délivre réellement. La production du jour de course reste sur VPS.
**FRs covered:** aucune — socle de déploiement (NFR-9 éprouvée de bout en bout)

## Epic 1: S'inscrire et boucler son dossier
Un coureur crée son accès (email + code, session unique), remplit le formulaire d'inscription à l'édition, accepte décharge et règlement horodatés, téléverse sa preuve CCP, suit sa checklist pièce par pièce et reçoit les notifications email. Inclut le scaffold du monorepo (apps/web, apps/runners, packages/shared), les design tokens Vert Djurdjura, le module iam et le socle de données multi-organisation (schéma + RLS).
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-27

### Epic 2: Vitrine publique de l'édition
Tout visiteur découvre la course (dates, épreuves, parcours GPX, égide fédération/ministère, glyphes piliers, frises), les sponsors (option A signature / option B multiples, bascule sans dev) et les infos pratiques éditables — « qui en jette » en < 300 Ko. Livrée minimale (annonce) pour le 15/11/2026, complète pour le jour J.
**FRs covered:** FR-21, FR-22, FR-23

### Epic 3: Armer les volontaires
L'organisation importe les volontaires par Excel (rapport ligne par ligne), découpe l'édition en secteurs et missions typées (couverture, chevauchements) ; chaque volontaire se connecte par email + code et retrouve sa fiche mission hors-ligne ; les appareils scanneurs préchargent l'annuaire des coureurs.
**FRs covered:** FR-9, FR-10, FR-11, FR-12

### Epic 4: Chronométrage offline & e-dossard
Dossier validé = e-dossard QR prêt (hors-ligne, 30 jours) ; les guichets scannent le retrait (voyant doublon) ; les scanneurs enregistrent les passages en zone blanche (bip + voyant < 1 s, validation contre l'annuaire local) ; la sync par lots idempotente remonte tout au retour du réseau — « l'appareil propose, le serveur dispose ».
**FRs covered:** FR-7, FR-8, FR-13, FR-14

### Epic 5: Piloter la course au PC
Nadia suit le tableau de bord live (retraits, partants, en course, arrivés, abandonnés, passages par checkpoint, fraîcheur = dernière sync), reçoit les alertes hors-délais clignotantes, saisit les abandons (lieu, motif, heure) et annule de façon auditable les passages erronés.
**FRs covered:** FR-17, FR-24, FR-25

### Epic 6: App coureurs & suivi GPS
Yacine installe l'app native (Expo — stores + repli APK), y retrouve dossier et e-dossard, active le tracking opt-in (5–10 min, précision équilibrée), passe le piège iOS « Autoriser une fois » (guide Réglages), reçoit la pédagogie batterie et le rappel J-7 ; tracking désactivé n'enregistre rien.
**FRs covered:** FR-18, FR-19 (capture), FR-20

### Epic 7: La course visible de l'extérieur
Classements par épreuve (départs échelonnés), résultats en direct partageables (jamais incohérents, suivi anonyme compté), carte publique anonyme (tracé GPX, pastilles dossards, positions > 1 h estompées) et rapports chiffrés post-course pour le directoire + export « commande » J-10.
**FRs covered:** FR-15, FR-16, FR-19 (affichage public), FR-26

### Epic 9: Refonte de la vitrine publique
Tout visiteur retrouve une vitrine qui se lit d'un coup d'œil : accueil à hero plein cadre, section parcours avec sélecteur d'épreuve, inscription en étapes, résultats. Vocabulaire de forme unique sur toute la surface publique, socle de classes sémantiques partagé en remplacement des feuilles CSS divergentes, budget 3G et plancher d'accessibilité tenus écran par écran. Livrable **sans** la carte 3D : la section parcours reste complète en texte (UX-DR-30).
**FRs covered:** aucune nouvelle — refonte de FR-21, FR-22, FR-23 déjà livrés
**UX-DRs covered:** UX-DR-32, 33, 34, 38, 39, 40, 41

### Epic 10: Refonte des surfaces d'exploitation
Les trois outils du jour J — PWA volontaires, app coureurs, back-office — passent sur le vocabulaire visuel de l'épopée 9, et les écarts aux spécifications UX déjà validées sont corrigés au passage (voyants de scan sous-dimensionnés, bandeaux de synchronisation, densité des tableaux admin).
**FRs covered:** aucune nouvelle — refonte des surfaces de FR-7 à FR-14, FR-24, FR-26
**UX-DRs covered:** UX-DR-32, 39, 41 ; reconduction de UX-DR-6 à UX-DR-12

### Epic 11: Le parcours en 3D
Le visiteur voit la course avant de la courir : pipeline build-time GPX → `parcours.json` avec porte de qualité, carte MapLibre à relief terrarium reprenant `poc/index.html`, profil altimétrique coloré par pente, curseur partagé carte ↔ profil par l'abscisse curviligne `s`, attributions permanentes, fond cartographique arbitré, deux épreuves sur géométrie partagée. Se branche dans la coquille livrée par la story 9.3 ; dégradation textuelle complète sans WebGL.
**FRs covered:** FR-28, FR-28b, FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37, FR-38, FR-39
**UX-DRs covered:** UX-DR-25 à UX-DR-31, 35, 36, 37

## Epic 1: S'inscrire et boucler son dossier

Un coureur crée son accès (email + code, session unique), remplit le formulaire d'inscription à l'édition, accepte décharge et règlement horodatés, téléverse sa preuve CCP, suit sa checklist pièce par pièce et reçoit les notifications email. Inclut le scaffold du monorepo (apps/web, apps/runners, packages/shared), les design tokens Vert Djurdjura, le module iam et le socle de données multi-organisation (schéma + RLS).

### Story 1.1: Fondation du monorepo

As a développeur bénévole de l'équipe Azzel,
I want un socle unique (monorepo pnpm, `apps/web` Next.js, `apps/runners` Expo, `packages/shared`, design tokens, conventions d'erreur),
So that tout pousse au même endroit dès le premier commit et le bus factor 1 reste gérable (sobriété + documentation).

**Acceptance Criteria:**

**Given** le dépôt fraîchement cloné avec Node ^22.13 || ^24.3
**When** `pnpm install && pnpm build`
**Then** `apps/web` (Next.js 16.4.2) build et sert une page racine française, `apps/runners` (Expo SDK 58, dev build) et `packages/shared` (TypeScript) compilent
**And** les tokens du frontmatter DESIGN.md (colors clair/sombre incl. opérationnelles, typography, rounded, spacing) sont implémentés en variables CSS + thème RN, source unique dans `shared` (UX-DR-1)
**And** la bascule clair/sombre suit la préférence système par défaut, override mémorisé (UX-DR-2) ; enveloppe d'erreur unique versionnée dans `shared` (UX-DR-21) ; horodatages ISO 8601 UTC stockés, affichage local.

### Story 1.2: Accès coureur par email + code, session unique

As a coureur,
I want créer mon accès avec mon email et un code de vérification à expiration courte,
So que mon compte soit protégé et que personne ne reste connecté à ma place sur un autre appareil.

**Acceptance Criteria:**

**Given** un email jamais utilisé
**When** je demande un code puis je le saisis correctement
**Then** mon compte est créé et je suis connecté ; le code est un UUID à expiration courte, envoyé via SMTP avec limitation de rythme (NFR-9)
**And** le champ de saisie est unique avec `inputmode="numeric"` + `autocomplete="one-time-code"`, collage autorisé, validité affichée, renvoi possible avec compte à rebours (UX-DR-19)
**And** un code erroné ou expiré ne crée aucun compte et affiche un message clair + action à faire
**And** toute nouvelle connexion révoque les sessions interactives antérieures du compte, tous rôles (FR-1, AD-5).

### Story 1.3: Formulaire d'inscription à l'édition

As a coureur,
I want m'inscrire à l'édition en choisissant mon épreuve et en saisissant mes informations,
So que mon dossard soit attribué sur des bases fiables et ma commande t-shirt exacte.

**Acceptance Criteria:**

**Given** mon accès créé (1.2)
**When** je soumets le formulaire d'inscription (épreuve longue/moyenne, identité, contact, urgence, taille de t-shirt)
**Then** la soumission incomplète est bloquée par les champs obligatoires ; la catégorie d'âge est dérivée (FR-2)
**And** la clôture à J-10 (16/03/2027) est configurable côté serveur : après échéance, la soumission est refusée avec message explicite
**And** la soumission crée uniquement les tables/lignes nécessaires (coureur rattaché à l'édition).

### Story 1.4: Acceptation décharge et règlement intérieur

As a coureur,
I want accepter la décharge de bonne santé et le règlement intérieur en ligne,
So que mon dossier soit juridiquement complet sans papier.

**Acceptance Criteria:**

**Given** le formulaire soumis (1.3)
**When** j'accepte les deux documents
**Then** chaque acceptation est horodatée avec la version du document (FR-3)
**And** toute soumission sans les deux acceptations est impossible.

### Story 1.5: Télversement de la preuve de paiement CCP

As a coureur,
I want déposer ma preuve de virement CCP compressée directement depuis mon téléphone,
So que mon dossier avance sans email ni papier.

**Acceptance Criteria:**

**Given** mon inscription soumise
**When** je sélectionne une image ou un PDF
**Then** compression/redimensionnement côté client ≤ 300 Ko avec feedback visible ; formats non image/PDF rejetés avant envoi avec message listant les formats acceptés (FR-4, UX-DR-20)
**And** en cas d'échec réseau : retry idempotent sans re-sélectionner le fichier, brouillon conservé localement, erreur doublée du bouton « Appeler l'équipe »
**And** la preuve est stockée dans le budget storage (1 Go free tier).

### Story 1.6: Validation ou refus du dossier par l'organisateur

As a organisateur,
I want valider ou refuser une preuve avec motif,
So que le coureur sache toujours où il en est, sans échange inutile.

**Acceptance Criteria:**

**Given** un dossier avec preuve déposée
**When** l'organisateur valide ou refuse
**Then** le refus exige un motif en champ libre court ; jamais de refus silencieux (FR-4)
**And** le motif remonte au coureur (email, 1.8) avec le numéro d'appel de l'équipe (UX-DR-11).

### Story 1.7: Checklist de dossier self-service

As a coureur peu à l'aise avec le numérique,
I want voir d'un coup d'œil ce qui manque dans mon dossier,
So que je sache exactement quoi faire sans appeler personne.

**Acceptance Criteria:**

**Given** mon espace coureur
**When** j'ouvre ma checklist (email vérifié, épreuve, décharge, règlement, preuve, validation)
**Then** chaque pièce manquante nomme l'action à faire en lien direct ; compteur de pièces affiché (FR-5, UX-DR-10)
**And** tout vert → bandeau « Dossier validé — dossard prêt » (libellé verbatim)
**And** le bouton d'assistance « Appeler l'équipe » reste visible sur l'écran (SM-C1, UX-DR-11).

### Story 1.8: Notifications de statut par email

As a coureur,
I want être informé par email des changements de statut,
So que je n'aie pas à vérifier le site tous les jours.

**Acceptance Criteria:**

**Given** un changement de statut (reçu, validé, refusé avec motif)
**When** le statut change
**Then** un email part via une file d'envoi avec rejeu (échec SMTP non bloquant) (FR-6)
**And** les libellés suivent la Voice and Tone de la spine (sobres, actionnables).

### Story 1.9: Socle multi-organisation (schéma + RLS)

As a créateur de la plateforme,
I want les données isolées par organisation dès la V1,
So que la location d'instances post-2027 ne demande aucun changement de schéma.

**Acceptance Criteria:**

**Given** le schéma métier des stories 1.2–1.8
**When** chaque table métier est créée ou reprise
**Then** `organisation_id` descend dans chaque table + politiques RLS Postgres actives (FR-27, AD-4)
**And** un test crée une seconde organisation avec son compte sans changement de schéma ni fuite de données entre instances.

## Epic 2: Vitrine publique de l'édition

Tout visiteur découvre la course (dates, épreuves, parcours GPX, égide fédération/ministère, glyphes piliers, frises), les sponsors (option A signature / option B multiples, bascule sans dev) et les infos pratiques éditables — « qui en jette » en < 300 Ko. Livrée minimale (annonce) pour le 15/11/2026, complète pour le jour J.

### Story 2.1: Page d'annonce publique minimale

As a visiteur sans compte,
I want découvrir le Trail d'Ait-Aissi (dates, épreuves, lieu, égide) et m'inscrire,
So que la course existe publiquement dès l'ouverture des inscriptions (jalon 15/11/2026).

**Acceptance Criteria:**

**Given** l'URL publique de la vitrine
**When** un visiteur l'ouvre sur une connexion 3G lente
**Then** le premier chargement pèse < 300 Ko et le premier rendu lisible arrive < 5 s (NFR-2, FR-21) ; hero typographique + SVG/dégradés, aucune webfont ni photo pleine largeur (UX-DR-14)
**And** la mention « Sous l'égide de la Fédération et du ministère des Sports » est toujours visible
**And** le CTA « S'inscrire » mène au parcours de l'épopée 1 ; contact « Appeler l'équipe » visible (SM-C1)
**And** squelettes de chargement calqués sur la mise en page finale ; GPX absent de cette page minimale.

### Story 2.2: Identité Village — piliers, frises, sombre

As a visiteur,
I want ressentir l'identité kabyle du village dans la page, sobrement,
So que la crédibilité et la chaleur se dégagent sans apparat ni folklore.

**Acceptance Criteria:**

**Given** la page d'annonce (2.1)
**When** la page s'affiche
**Then** les 4 piliers sport/santé/citoyenneté/écologie portent chacun un petit glyphe SVG inline 20–24 px monochrome sapin (ⵣ Yaz, tala, tabzimt, ingel), jamais de médaillon ni mascotte (UX-DR-4)
**And** frise kabyle monochrome sapin en seuils tête/pied, décorative, `aria-hidden`, jamais derrière du texte (UX-DR-3)
**And** mode sombre : défaut système, override mémorisé, bascule visible en en-tête (UX-DR-2) ; contrastes AA+ vérifiés dans les deux modes
**And** aucun symbole politique ou sacré détourné, le mot « Tafsut » n'apparaît nulle part comme label.

### Story 2.3: Bloc sponsors option A / option B

As a organisateur,
I want configurer le sponsoring retenu (sponsor unique ou plusieurs) sans développeur,
So que la vitrine absorbe le scénario Ifri (A) comme le repli (B).

**Acceptance Criteria:**

**Given** l'espace admin
**When** je configure l'option A (sponsor unique, emplacement signature) ou l'option B (plusieurs sponsors, sans exclusivité)
**Then** la vitrine reflète le choix immédiatement, bascule A→B sans développement (FR-22)
**And** en option A le nom du sponsor porte l'emplacement signature ; en option B les emplacements sont équivalents.

### Story 2.4: Parcours GPX, consignes et page région

As a coureur ou proche,
I want consulter le parcours, les ravitaillements, les consignes de sécurité et les infos pratiques de la région,
So que j'arrive préparé et en sécurité le jour J.

**Acceptance Criteria:**

**Given** la vitrine complète
**When** je consulte la page course
**Then** dates, épreuves (Longue ~35 km / Moyenne 10–15 km), dénivelés, horaires, ravitaillements et consignes de sécurité sont publics sans compte (FR-21) ; tracé GPX en chargement différé, jamais dans le chemin critique
**And** la page région porte la consigne sécurité « ne pas défier la montagne » (sagesse de la vieille de janvier) et la note écologie des singes sacrés du Jurjura, en contenu éditorial sobre
**And** l'admin édite hébergement, restauration, région et événements annexes sans développement (FR-23) ; citation « Aman d laman » réservée aux ravitaillements, source notée (UX-DR-5).

### Story 2.5: Vidéo trailer 1ʳᵉ édition & témoignages coureurs (Should)

As a visiteur,
I want voir la 1ʳᵉ édition en images et lire des coureurs,
So que la crédibilité de l'organisation se voie avant même la course.

**Acceptance Criteria:**

**Given** des images/vidéos de la 1ʳᵉ édition disponibles (question ouverte : matière à vérifier)
**When** la vitrine se charge
**Then** le trailer s'affiche en poster léger (dégradé + bouton lecture vert altitude ≥ 3:1) et ne charge qu'au clic — jamais d'autoplay, jamais dans le budget des 300 Ko initiaux (UX-DR-15)
**And** les témoignages (citations courtes + visage ou avatar initiales + édition de référence) sont sobres, jamais en carrousel automatique
**And** si la matière 1ʳᵉ édition manque, les deux blocs se désactivent proprement sans page cassée.

## Epic 3: Armer les volontaires

L'organisation importe les volontaires par Excel (rapport ligne par ligne), découpe l'édition en secteurs et missions typées (couverture, chevauchements) ; chaque volontaire se connecte par email + code et retrouve sa fiche mission hors-ligne ; les appareils scanneurs préchargent l'annuaire des coureurs.

### Story 3.1: Import Excel des volontaires et invitations

As a organisateur,
I want importer ma liste de volontaires et déclencher les invitations,
So que 150–200 villageois soient opérationnels sans saisie manuelle.

**Acceptance Criteria:**

**Given** un fichier Excel (nom, email, téléphone)
**When** l'admin lance l'import
**Then** les lignes valides créent les volontaires ; les lignes invalides sont rejetées avec rapport ligne par ligne — jamais d'import silentieux (FR-9)
**And** chaque volontaire reçoit une invitation (file d'envoi avec rejeu) l'orientant vers la connexion par email + code — même mécanisme que coureurs et organisateurs (story 1.2), aucun mot de passe
**And** sa première connexion réussie le marque « activé » dans la liste admin ; la session ouverte révoque les sessions antérieures (session unique tous rôles)
**And** un volontaire importé est rattaché à l'organisation (RLS, story 1.9).

### Story 3.2: Secteurs et missions typées

As a organisateur,
I want découper l'édition en secteurs et y affecter des missions typées,
So que chacun sache exactement où se placer et quoi faire le jour J.

**Acceptance Criteria:**

**Given** des volontaires importés (3.1)
**When** l'admin crée secteurs et missions (types : scan checkpoint, accueil, sécurité tronçon, sécurité arrivée, distribution dossards, communication)
**Then** chaque mission affiche son état de couverture : couverte / vacante (FR-10)
**And** une affectation créant un chevauchement horaire pour un volontaire déclenche un avertissement non bloquant.

### Story 3.3: Fiche mission hors-ligne (PWA volontaires)

As a volontaire du village,
I want ma fiche mission dans ma poche, sans réseau, application fermée,
So que je sache où me placer, à quelle heure, et qui appeler le jour J.

**Acceptance Criteria:**

**Given** une mission affectée à Karim
**When** il ouvre la PWA volontaires (installable, iOS Safari inclus)
**Then** sa fiche (secteur, rôle, horaires, contacts, consignes) est préchargée à l'affectation et consultable réseau absent, app fermée (FR-11, NFR-8)
**And** les contacts PC sont cliquables (tel:) ; lecture confortable sur Android d'entrée de gamme (cibles ≥ 48 dp, frappe ≥ 15 px)
**And** le scan QR n'apparaît que comme une mission parmi d'autres.

### Story 3.4: Préchargement de l'annuaire des coureurs

As a scanneur volontaire,
I want l'annuaire des coureurs de l'édition dans mon téléphone avant le départ,
So que mes scans soient validés localement même en zone blanche.

**Acceptance Criteria:**

**Given** des coureurs aux dossards attribués
**When** l'appareil du scanneur se prépare (avant le départ)
**Then** l'annuaire de l'édition (dossards, identité) est répliqué en IndexedDB, versionné via `shared` (FR-12, AD-8)
**And** l'état de préchargement est visible (« annuaire prêt — N coureurs ») et annoncé au lecteur d'écran
**And** un coureur absent de l'annuaire sera signalé « DOSSARD INCONNU » au scan (consommé par l'épopée 4).

## Epic 4: Chronométrage offline & e-dossard

Dossier validé = e-dossard QR prêt (hors-ligne, 30 jours) ; les guichets scannent le retrait (voyant doublon) ; les scanneurs enregistrent les passages en zone blanche (bip + voyant < 1 s, validation contre l'annuaire local) ; la sync par lots idempotente remonte tout au retour du réseau — « l'appareil propose, le serveur dispose ».

### Story 4.1: E-dossard QR hors-ligne

As a coureur au dossier validé,
I want mon e-dossard QR disponible sans aucune connexion,
So que je le présente au guichet le jour J, zéro papier.

**Acceptance Criteria:**

**Given** un dossier validé (épopée 1)
**When** j'ouvre mon e-dossard
**Then** le QR s'affiche en haute définition, encodant le jeton unique édition (jamais le dossard nu), résolu via annuaire (FR-7, AD-8)
**And** le QR reste lisible après 30 jours de cache, réseau absent (NFR-6) ; carte blanche à coins 16 px, modules encre, quel que soit le mode
**And** badge « HORS-LIGNE PRÊT » + raccourci système recommandé (widget/quick settings) accessible en un geste écran verrouillé (UX-DR-9).

### Story 4.2: Moteur de scan caméra et états de retour

As a volontaire scanneur,
I want une caméra plein écran qui me confirme chaque scan immédiatement,
So que je garde les yeux sur la course, pas sur l'écran.

**Acceptance Criteria:**

**Given** la PWA volontaires avec annuaire chargé (3.4)
**When** je tape « Démarrer le scan »
**Then** l'audio est débloqué par ce premier geste ; lecture via BarcodeDetector avec fallback @zxing/browser toujours actif sur iOS Safari (NFR-1)
**And** chaque scan retourne en < 1 s : bip (mélodies distinctes succès/doublon/inconnu) + vibration + texte intégral ; voyant en `aria-live="assertive"` avec `role="status"` (UX-DR-6, UX-DR-7)
**And** permission caméra refusée ou caméra indisponible → détection au premier lancement, écran dédié « Autoriser la caméra » avec chemin Réglages complet + bouton assistance PC (UX-DR-18)
**And** voile quasi opaque ≥ 96 % derrière tout texte du cadre ; badges « · LIVE » + heure locale + mission en cours.

### Story 4.3: Scan de retrait du dossard

As a volontaire au guichet de retrait,
I want scanner l'e-dossard pour marquer le coureur « présent au départ »,
So que ~700 retraits le jour J passent en express, sans fichier papier.

**Acceptance Criteria:**

**Given** le moteur de scan (4.2) et des e-dossards validés
**When** je scanne un coureur au guichet
**Then** le retrait est enregistré hors-ligne, marqué « présent au départ » (FR-8)
**And** un second scan du même coureur affiche le voyant doublon « ↻ DÉJÀ PASSÉ » avec l'heure du premier retrait — aucun enregistrement dupliqué.

### Story 4.4: Scan de passage aux checkpoints

As a scanneur en zone blanche,
I want enregistrer chaque passage sans réseau et sans erreur,
So que le chrono de la course soit complet et fiable au soir.

**Acceptance Criteria:**

**Given** le moteur de scan (4.2) et l'annuaire local (3.4)
**When** un coureur franchit mon checkpoint
**Then** le Passage (e-dossard → checkpoint, horodatage local, validation contre l'annuaire) est confirmé en < 1 s : « ✓ Passage enregistré — dossard 217 · 10:42:07 » (FR-13, NFR-1)
**And** doublon même coureur/même checkpoint → « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS », Passage non dupliqué ; inconnu → « ⚠ DOSSARD INCONNU — revérifier » + bouton « Appeler le PC » direct
**And** voyant : pill ≥ 96 px plein cadre, texte ≥ 24 px graisse 800, heure mono ≥ 16 px, clignotement ≤ 1 flash/s ; icônes et positions différencient doublon/inconnu (UX-DR-7).

### Story 4.5: Synchronisation par lots idempotente

As a volontaire qui aperçoit du réseau à 14 h,
I want que tout ce que j'ai scanné remonte sans doublon,
So que le soir, la course est complète — « 217 passages en attente → envoyés ».

**Acceptance Criteria:**

**Given** des Passages/Retraits dans l'outbox locale (IndexedDB, append-only, AD-2)
**When** le réseau revient
**Then** l'envoi se fait par lots idempotents (clé naturelle appareil+checkpoint+coureur) — le rejeu ne crée jamais de doublon visible (FR-14, NFR-3)
**And** bandeau sync toujours visible : « ◷ N passages en attente » → « ✓ envoyés — file : 0 » ; journal sync (lots, rejets, offsets horloge) consultable en lecture seule (UX-DR-8)
**And** l'arbitrage est serveur : premier Passage reçu par checkpoint fait foi pour le classement, les suivants archivés pour audit, neutres ; jamais de suppression locale ni de temps « définitif » côté appareil (AD-3)
**And** la boîte d'envoi survit à une session révoquée (jeton d'appareil dédié, AD-5).

## Epic 5: Piloter la course au PC

Nadia suit le tableau de bord live (retraits, partants, en course, arrivés, abandonnés, passages par checkpoint, fraîcheur = dernière sync), reçoit les alertes hors-délais clignotantes, saisit les abandons (lieu, motif, heure) et annule de façon auditable les passages erronés.

### Story 5.1: Tableau de bord live du PC course

As a organisatrice au PC,
I want suivre la course en direct avec des chiffres dont je connais la fraîcheur,
So que je décide sur du fiable, jamais sur du figé présenté comme vivant.

**Acceptance Criteria:**

**Given** des retraits et passages synchronisés (épopée 4)
**When** Nadia ouvre le tableau de bord
**Then** retraits, partants par épreuve, en course, arrivés, abandonnés et passages par checkpoint s'affichent (FR-24) ; rafraîchissement realtime réservé à cette surface, sans flash complet de la page
**And** la fraîcheur (« synchronisé il y a X min ») est accolée aux chiffres en toutes circonstances, y compris réseau dégradé (NFR-5)
**And** lignes de board live : tri par heure de passage décroissante, badge dossard mono, heure mono 15 px alignée à droite, séparateurs pointillés, non cliquables en V1 (UX-DR-12)
**And** réseau dégradé → les chiffres restent affichés avec leur fraîcheur, les alertes émises restent visibles.

### Story 5.2: Alertes hors-délais

As a organisatrice au PC,
I want être alertée quand un coureur n'a pas franchi un checkpoint avant sa barrière horaire,
So que la sécurité des coureurs ne repose pas sur la vigilance humaine seule.

**Acceptance Criteria:**

**Given** des barrières horaires configurées par checkpoint (question ouverte PRD n°1 : nombre/seuils)
**When** un coureur attendu n'a pas franchi le checkpoint avant sa barrière
**Then** une alerte s'affiche en bloc danger clignotant (période ≥ 1 s), avec texte intégral : coureur, checkpoint, barrière (FR-25, UX-DR-12)
**And** actions directes : « Appeler le secteur » (contact de la mission) et « Saisir l'abandon »
**And** l'alerte batterie < 15 % des coureurs opt-in tracking est balisée `[ASSUMPTION: Should — à confirmer]`
**And** clignotement désactivé sous `prefers-reduced-motion` (le texte intégral porte alors seul l'alerte).

### Story 5.3: Saisie des abandons

As a organisatrice ou volontaire de secteur,
I want saisir un abandon en trois champs,
So que le coureur sorte proprement des calculs et que sa sécurité soit tracée.

**Acceptance Criteria:**

**Given** un coureur en course
**When** un abandon est saisi (coureur, lieu, motif, heure locale)
**Then** le coureur sort des calculs de classement en cours et reste dans les rapports (FR-17)
**And** abandons concurrents (PC et secteur) : les premiers reçus serveur gagnent (AD-3)
**And** l'heure est convertie en local à l'affichage (convention horodatage).

### Story 5.4: Annulation auditable des passages

As a organisatrice au PC,
I want corriger un passage erroné (mauvais scan, mauvais coureur),
So que le chrono reste juste sans jamais effacer l'historique.

**Acceptance Criteria:**

**Given** un Passage synchronisé erroné
**When** Nadia l'annule depuis l'admin
**Then** l'annulation est auditable : auteur, horodatage, motif tracés ; le Passage reste archivé, neutre pour les classements (AD-8)
**And** aucune surface (PWA, app, admin) ne permet une suppression de Passage — seule l'annulation tracée existe.

## Epic 6: App coureurs & suivi GPS

Yacine installe l'app native (Expo — stores + repli APK), y retrouve dossier et e-dossard, active le tracking opt-in (5–10 min, précision équilibrée), passe le piège iOS « Autoriser une fois » (guide Réglages), reçoit la pédagogie batterie et le rappel J-7 ; tracking désactivé n'enregistre rien.

### Story 6.1: Installation et onboarding de l'app native

As a coureur,
I want installer l'app Azzel et y retrouver mon dossier,
So que tout tienne dans ma poche le jour J.

**Acceptance Criteria:**

**Given** un compte coureur actif (épopée 1)
**When** Yacine installe l'app (Play Store / App Store — soumission anticipée ; repli Android : APK sideload documenté)
**Then** il se connecte avec le même email + code (session unique s'applique, AD-5)
**And** l'app est une dev build Expo SDK 58 (expo-location), pas Expo Go
**And** dossier et e-dossard sont retrouvés ; dossier déjà vert → accès direct à l'e-dossard, étapes court-circuitées.

### Story 6.2: Activation du suivi GPS opt-in

As a coureur,
I want activer le suivi pour que mes proches me voient avancer,
So que ma course soit suivie sans sacrifier ma batterie.

**Acceptance Criteria:**

**Given** l'app installée (6.1)
**When** j'active le tracking (opt-in explicite)
**Then** positions capturées toutes les 5–10 min en « précision équilibrée », stockées en cache hors-ligne, envoyées en lot au retour réseau (FR-18, AD-2)
**And** « Désactivé : rien n'est enregistré » est littéral — aucun enregistrement à l'insu (anonymat & vie privée)
**And** la fréquence n'est jamais augmentée pour embellir la carte au prix de la batterie (SM-C2).

### Story 6.3: Guide permission iOS « Autoriser une fois »

As a coureur sur iPhone,
I want être guidé quand le suivi s'arrête à cause de la permission « Autoriser une fois »,
So que mon suivi reste actif sans que j'aie à deviner pourquoi il a coupé.

**Acceptance Criteria:**

**Given** le tracking activé et une permission localisation iOS expirée (« Autoriser une fois »)
**When** je rouvre l'app ou reviens au premier plan
**Then** l'app détecte l'état et affiche l'écran guide : chemin complet « Réglages > Azzel > Localisation > Toujours » en exergue + bouton « Ouvrir les Réglages » (UX-DR-16)
**And** permission refusée → suivi silencieusement inactif, aucune culpabilisation ; guide toujours accessible depuis l'app
**And** le rétablissement de la permission relance le suivi sans manipulation supplémentaire.

### Story 6.4: Pédagogie batterie et rappel J-7

As a coureur,
I want savoir comment préserver ma batterie le jour J,
So que mon suivi et mon e-dossard tiennent jusqu'à l'arrivée.

**Acceptance Criteria:**

**Given** l'app installée
**When** j'active le suivi ou j'ouvre la rubrique batterie
**Then** la carte à puces affiche : partir à 100 %, ne pas tuer l'application, powerbank (en vente au village), conclue par la citation « Un point après l'autre, et l'ouvrage est parfait » avec source Hanoteau 1867 (FR-20, UX-DR-5/17)
**And** à J-7, un email de rappel part (file d'envoi avec rejeu) avec bouton vers l'app
**And** l'alerte batterie < 15 % côté coureur est balisée `[ASSUMPTION: Should — à confirmer]`.

## Epic 7: La course visible de l'extérieur

Classements par épreuve (départs échelonnés), résultats en direct partageables (jamais incohérents, suivi anonyme compté), carte publique anonyme (tracé GPX, pastilles dossards, positions > 1 h estompées) et rapports chiffrés post-course pour le directoire + export « commande » J-10.

### Story 7.1: Classements par épreuve et départs échelonnés

As a proche, média ou fédération,
I want des classements justes par épreuve,
So que chaque coureur soit comparé à sa course réelle.

**Acceptance Criteria:**

**Given** des Passages arbitrés serveur (épopée 4) et des heures de départ officielles configurées côté serveur
**When** les classements sont calculés
**Then** chaque épreuve a son classement avec départs échelonnés gérés ; un coureur n'apparaît que dans le classement de son épreuve (FR-15)
**And** classement scratch + `[ASSUMPTION: par sexe et catégories d'âge — crédibilité fédération, à confirmer]`
**And** un rafraîchissement n'expose jamais de classement partiel incohérent (NFR-4)
**And** le scan au départ = contrôle de présence, jamais référence horaire de classement (AD-3).

### Story 7.2: Résultats en direct partageables

As a Malika depuis Tizi Ouzou,
I want suivre les résultats en direct et partager le lien,
So que toute la Kabylie vive la course en même temps.

**Acceptance Criteria:**

**Given** la vitrine publique (épopée 2)
**When** des Passages sont synchronisés
**Then** classements et passages se mettent à jour via SSE/polling servi par le backend — jamais de lecture directe Supabase realtime depuis les navigateurs publics (AD-7)
**And** les URLs de résultats sont partageables avec paramètre de suivi anonyme compté côté serveur (FR-16, SM-5) — aucune donnée personnelle
**And** affichage « Classement provisoire » en toutes lettres + fraîcheur ; état vide avant départ : « Pas encore de partants — départ à HH:MM ».

### Story 7.3: Carte publique anonyme

As a proche du coureur,
I want voir la dernière position connue sur le tracé officiel,
So que je suive la course sans exposer qui que ce soit.

**Acceptance Criteria:**

**Given** des positions émises par les coureurs opt-in (épopée 6)
**When** j'ouvre la carte publique
**Then** la dernière position connue de chaque coureur opt-in s'affiche sur le tracé GPX + checkpoints, identifiée par numéro de dossard qualifié par édition uniquement — jamais nom, contact ou photo (FR-19, NFR-7)
**And** les positions de plus d'une heure `[ASSUMPTION: X = 1 h]` sont estompées ; la dernière position connue est affichée comme telle
**And** le choix de bibliothèque cartographique (Leaflet vs MapLibre) est local au module vitrine ; la carte ne charge jamais dans le chemin critique 3G.

### Story 7.4: Rapports post-course et export « commande »

As a directoire de l'organisation,
I want le bilan chiffré complet de l'édition,
So que la réputation s'appuie sur des chiffres, et que rien ne soit commandé à l'aveugle.

**Acceptance Criteria:**

**Given** l'édition terminée
**When** l'admin exporte le rapport post-course
**Then** un fichier unique couvre l'édition complète : inscrits, présents, passages, arrivées, abandons, portée des partages (FR-26)
**And** à J-10, l'export « commande » fournit les décomptes validés par épreuve et par taille de t-shirt (médailles, t-shirts — zéro stock)
**And** le format d'export suit le choix local du module admin (question ouverte archi) ; les abandons y figurent (5.3).


## Epic 8: Environnement de recette hébergé

Épopée technique, hors périmètre produit. `apps/web` est mis en ligne sur une URL stable pour que le comité d'organisation prenne l'application en main avant le jour J. Le jeu de données est entièrement fictif et régénérable ; le comité s'authentifie dans l'application comme n'importe quel utilisateur, sans protection au niveau de l'hébergeur. La production du jour de course reste sur VPS, conformément à la spine.

Référence : `_bmad-output/implementation-artifacts/note-archi-winston-deploiement-vercel.md`.

**Règle cardinale de l'épopée : aucune donnée réelle de coureur ne doit atteindre cet environnement.** Les seules adresses email réelles sont celles des membres du comité, qui reçoivent leurs codes de connexion.

### Story 8.1: Fabrique de connexion unique et base hébergée

As a développeur bénévole de l'équipe Azzel,
I want une fabrique de connexion Postgres unique, compatible avec un pooler en mode transaction, et une base hébergée sur laquelle tourner ailleurs que sur ma machine,
So that l'application puisse être déployée sans saturer la base ni échouer sur des requêtes préparées, et que les dix modules cessent d'ouvrir chacun leur propre pool.

**Acceptance Criteria:**

**Given** les dix modules qui instancient aujourd'hui `postgres(databaseUrl, { max: 5, ... })` chacun de leur côté — `inscriptions`, `iam`, `missions`, `chrono`, `rapports`, `sponsors`, `contenus`, `tracking`, `retour-images`, `outbox`
**When** le refactor est appliqué
**Then** une fabrique unique `apps/web/src/db/client.ts` expose un pool mémoïsé, et aucun module n'appelle plus `postgres(...)` directement — seuls les CLI (`migrate`, `send-cli`, `j7-cli`) et les utilitaires de test conservent leur connexion propre
**And** la fabrique pose `prepare: false` — `postgres.js` prépare par défaut et PgBouncer en mode transaction ne le supporte pas : sans cela des erreurs `prepared statement already exists` surviennent dès qu'une connexion est recyclée
**And** la taille du pool est pilotée par l'environnement : réduite en exécution serverless, inchangée en local
**And** la garde de rôle applicatif `protegerStore` et la mémoïsation par `globalThis` sont conservées telles quelles sur chaque store
**And** `withOrg` et `set_config(..., true)` ne sont pas modifiés : le contexte RLS est déjà de portée transaction, donc déjà compatible pooler (audit du 2026-11-01)
**And** `multi-org.integration.test.ts` et l'ensemble de la suite passent sans modification de test — ils constituent la preuve que le RLS multi-organisation survit au refactor (AD-4)

**Given** le besoin d'une base joignable depuis l'extérieur
**When** le projet Supabase est provisionné
**Then** les migrations s'appliquent avec `DATABASE_OWNER_URL` sur la connexion directe (port 5432), jamais via le pooler
**And** l'application se connecte avec `DATABASE_URL` sur le pooler en mode transaction (port 6543), sous le rôle `azzel_app` soumis au RLS
**And** une vérification documentée atteste qu'une organisation ne voit pas les données d'une autre sur la base hébergée, et pas seulement en local.

### Story 8.2: Stockage des preuves de paiement hors disque local

As a membre du comité d'organisation,
I want pouvoir téléverser une preuve de paiement et la revoir plus tard sur l'environnement de recette,
So that je puisse éprouver le parcours de validation de dossier, qui est l'un des gestes que j'aurai à faire pour de vrai.

**Acceptance Criteria:**

**Given** l'interface `ProofStore` existante (`put` / `read` / `remove`) et son implémentation `LocalDiskProofStore`, qui écrit dans `STORAGE_DIR` — inutilisable sur un système de fichiers éphémère
**When** une implémentation de stockage objet est ajoutée derrière la même interface
**Then** l'implémentation retenue est sélectionnée par configuration, sans modification des appelants, et `LocalDiskProofStore` reste le comportement par défaut en développement local
**And** la vérification de cohérence entre le format déclaré et le contenu détecté (`detectProofFormat`) est conservée : un contenu incohérent est refusé à l'écriture, comme aujourd'hui
**And** les clés de stockage restent opaques et vérifiées par `isSafeStorageKey` — aucune clé ne peut désigner un chemin hors du dépôt de preuves
**And** `put` retourne les mêmes métadonnées qu'avant : clé, type MIME, taille, empreinte SHA-256 du contenu
**And** `read` sur une clé inconnue retourne l'absence, sans erreur ; `remove` est idempotent

**Given** une preuve téléversée sur l'environnement hébergé
**When** le serveur est redémarré ou la fonction réinstanciée
**Then** la preuve est toujours lisible et l'écran de validation de dossier l'affiche — c'est le critère qui distingue ce stockage du disque local.

### Story 8.3: Jeu de données fictif « édition complète »

As a membre du comité d'organisation,
I want arriver sur une application déjà peuplée d'une édition crédible,
So that je puisse exercer tout de suite les écrans qui m'intéressent, sans avoir à saisir cinquante coureurs avant de voir quoi que ce soit.

**Acceptance Criteria:**

**Given** une base hébergée vide, migrations appliquées
**When** le script de seed est exécuté
**Then** une organisation et une édition datée existent, avec plusieurs épreuves et des horaires de départ échelonnés
**And** une cinquantaine de coureurs sont inscrits, répartis sur tous les stades du dossier — en attente de pièces, en attente de validation, validé, refusé — de sorte qu'il y ait réellement matière à valider et à refuser
**And** des preuves de paiement sont déposées pour les dossiers qui en sont à ce stade, lisibles via le stockage retenu en 8.2
**And** le découpage en secteurs, les missions typées et les volontaires assignés existent, de quoi ouvrir une fiche mission
**And** de quoi exercer le chrono et les rapports est présent : dossards attribués, quelques passages enregistrés
**And** noms, adresses et numéros sont manifestement inventés ; aucune adresse email sortante n'appartient à une personne extérieure à l'équipe

**Given** un environnement dans lequel le comité a expérimenté et cassé des choses
**When** le script est relancé
**Then** il est idempotent — une seconde exécution ne duplique rien
**And** une commande de réinitialisation documentée ramène l'environnement à l'état initial sans intervention manuelle en base.

### Story 8.4: Mise en ligne de la recette et remise au comité

As a membre du comité d'organisation,
I want recevoir une adresse où me connecter avec mon email, et y retrouver l'application complète,
So that je puisse me former à l'outil et dire ce qui ne va pas, longtemps avant le jour de la course.

**Acceptance Criteria:**

**Given** les stories 8.1, 8.2 et 8.3 livrées
**When** l'application est déployée
**Then** elle est servie depuis `apps/web` sur une URL stable, sous le domaine du projet, en HTTPS
**And** `APP_URL` pointe sur cette adresse : les liens contenus dans les emails de notification y mènent, et non vers `localhost`
**And** aucune protection n'est posée au niveau de l'hébergeur — le comité s'authentifie par le code à six chiffres de l'application ; la confidentialité repose sur ce code et sur une URL non publiée, ce qui n'est tenable que parce qu'aucune donnée réelle n'est en jeu
**And** `AZZEL_ADMIN_EMAILS` contient les adresses des membres du comité, qui arrivent donc organisateurs dès leur première connexion

**Given** un expéditeur email configuré sur le domaine du projet, avec DKIM et SPF posés
**When** un membre du comité demande son code de connexion
**Then** il le reçoit dans sa boîte, en moins d'une minute, hors dossier indésirables
**And** la vérification a été faite **sur chaque adresse du comité** avant l'annonce de l'URL — un membre qui ne reçoit pas son code ne prend rien en main
**And** les emails sortants portent une mention explicite d'environnement de démonstration à données fictives, pour qu'un message égaré ne soit jamais pris pour une communication officielle
**And** le `Reply-To` renvoie vers la boîte humaine de l'événement
**And** un enregistrement SPF unique existe sur le domaine : deux enregistrements SPF font échouer les deux.


## Epic 9: Refonte de la vitrine publique

Tout visiteur retrouve une vitrine qui se lit d'un coup d'œil : accueil à hero plein cadre, section parcours avec sélecteur d'épreuve, inscription en étapes, résultats. Vocabulaire de forme unique sur toute la surface publique, socle de classes sémantiques partagé en remplacement des feuilles CSS divergentes, budget 3G et plancher d'accessibilité tenus écran par écran. Livrable sans la carte 3D : la section parcours reste complète en texte.

Référence visuelle : `_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md` (artboards `Main`, `Inscription`, `Resultats`).

### Story 9.1: Socle de style partagé

As a développeur de l'équipe Azzel,
I want un socle de classes sémantiques dérivé des tokens, au lieu de quatorze feuilles qui redéfinissent chacune leurs valeurs,
So that un changement de charte se fasse en un endroit et qu'aucun écran ne dérive silencieusement.

**Acceptance Criteria:**

**Given** les quatorze feuilles CSS actuelles d'`apps/web` — `globals.css` (1 485 lignes), `volontaires/volontaires.css` (446), `volontaires/scan/scan.css` (273), `tokens-synchronises.css` (159), `espace-coureur/e-dossard/e-dossard.css` (143), `resultats/resultats.css` (109), `admin/course/course.css` (93), `vitrine-textes.css` (52) et les six feuilles admin résiduelles
**When** le socle est posé
**Then** un jeu de classes sémantiques couvre les primitives partagées — action (pilule), chip, carte, en-tête de surface, pastille d'état, tableau dense, champ de formulaire — chacune lisant exclusivement les tokens de `packages/shared/src/tokens.ts` (UX-DR-32, UX-DR-39)
**And** aucune feuille de surface ne redéfinit une valeur de couleur, de rayon, d'espacement ou de graisse : toute valeur littérale restante est soit justifiée en commentaire, soit remontée en token
**And** le vocabulaire de rayons est unifié — pilule pour les actions et les chips, 14 à 20 px pour les cartes — et le mélange 4/6/8 px hérité disparaît de la surface publique
**And** `packages/shared/src/tokens.test.ts` continue de passer sans modification : la parité clair/sombre et les valeurs de la charte ne bougent pas

**Given** le socle posé
**When** la suite de tests est exécutée
**Then** `pnpm test` et `pnpm typecheck` passent sur les trois paquets
**And** aucun écran existant n'est visuellement cassé : les stories suivantes refondent, celle-ci ne change que la provenance des valeurs.

### Story 9.2: Accueil refondu

As a visiteur qui découvre la course,
I want une page d'accueil qui me dise en un écran de quoi il s'agit et quand,
So that je sache en trois secondes si cette course est pour moi.

**Acceptance Criteria:**

**Given** la page `apps/web/src/app/page.tsx` et son rendu serveur mis en cache 60 s
**When** la refonte est appliquée
**Then** le hero occupe le premier écran : fond sombre à dégradé radial forêt, silhouette de crête en deux plans dessinée en SVG — aucune image bitmap ajoutée au chemin critique —, titre condensé à très grande échelle avec le nom de l'événement en accent ocre, date de l'édition, et rail de chiffres clés cloisonné (épreuves, D+ maximal, plage d'altitude, places) (UX-DR-33)
**And** les chiffres du bilan de l'édition précédente tiennent sur une bande horizontale fond forêt, et non plus sur une section pleine hauteur de cartes (UX-DR-34)
**And** les quatre piliers, l'appel aux bénévoles et le bloc partenaires reprennent le vocabulaire de formes de la story 9.1

**Given** les critères d'acceptation des stories 2.1 et 2.2, qui restent exigibles
**When** l'accueil refondu est servi
**Then** la mention « sous l'égide de la fédération et du ministère des sports » reste visible sans défilement conditionnel (FR-21)
**And** les frises kabyles et les glyphes des piliers sont conservés, décoratifs, `aria-hidden`, jamais derrière du texte (UX-DR-3, UX-DR-4)
**And** le bloc sponsors conserve la bascule option A / option B sans dev, lue en base (FR-22)
**And** le premier chargement reste sous 300 Ko et le premier rendu lisible sous 5 s en 3G lent (NFR-2, UX-DR-40) — mesuré, pas supposé

**Given** un visiteur sur téléphone
**When** il ouvre l'accueil
**Then** le titre du hero descend par paliers jusqu'à rester lisible sans débordement horizontal
**And** le rail de chiffres passe sous le titre au lieu de le comprimer
**And** aucune cible tactile ne descend sous 44 px ni ne touche le bord de l'écran.

### Story 9.3: Coquille de la section parcours

As a coureur qui hésite entre les deux épreuves,
I want comparer les deux parcours sur la page d'accueil,
So that je choisisse mon épreuve sans aller chercher un PDF.

**Acceptance Criteria:**

**Given** l'accueil refondu de la story 9.2
**When** la section parcours est ajoutée
**Then** un sélecteur d'épreuve pilote d'un seul geste l'ensemble de la section : synthèse chiffrée, liste des points de passage et emplacements réservés à la carte et au profil (UX-DR-35)
**And** l'épreuve active est l'unique état partagé de la section ; basculer n'affiche jamais un kilométrage orphelin de son référentiel (UX-DR-31)
**And** la synthèse donne distance, D+, D−, plage d'altitude, heure de départ et barrière horaire en chiffres monospace alignés, suivie des points de passage avec leurs services en toutes lettres — jamais en icône seule (UX-DR-38, UX-DR-26)

**Given** que la carte 3D et le profil ne sont pas encore livrés (épopée 11)
**When** un visiteur ouvre la section
**Then** elle est complète et utile sans eux : le bloc parcours textuel tient seul, avec un emplacement explicitement annoncé pour la visualisation à venir, jamais un cadre vide ni un message d'erreur (UX-DR-30)
**And** le contrat de données que consommera l'épopée 11 est posé : la section lit une structure unique par épreuve (métadonnées, points de passage) et la story 11.1 la remplira depuis `parcours.json` sans changer le rendu

**Given** le budget de la vitrine
**When** la section est rendue
**Then** elle n'ajoute aucune dépendance JavaScript au chemin critique
**And** la section ne prend jamais le premier écran de la page (UX-DR-25).

### Story 9.4: Inscription et checklist refondues

As a coureur qui monte son dossier,
I want voir où j'en suis et ce qu'il me reste à faire,
So that je ne laisse pas mon inscription à moitié faite.

**Acceptance Criteria:**

**Given** les écrans `apps/web/src/app/inscription/` et la checklist de dossier
**When** la refonte est appliquée
**Then** les étapes du dossier sont matérialisées par un fil d'étapes indiquant l'étape courante par la forme et par le texte, jamais par la couleur seule
**And** chaque champ porte un `<label>` associé, les champs obligatoires sont annoncés en texte, et les messages d'erreur suivent l'enveloppe d'erreur unique avec le bouton d'assistance (UX-DR-21, UX-DR-11)
**And** le dépôt de la preuve de paiement conserve la compression client ≤ 300 Ko avec retour visible, le rejet de format listant les formats acceptés, et le brouillon conservé (UX-DR-20)
**And** la checklist conserve son compteur de pièces, l'action nommée pour chaque pièce manquante, et le bandeau « Dossier validé — dossard prêt » quand tout est vert (UX-DR-10, FR-5)

**Given** un dossier en cours sur téléphone
**When** l'écran est affiché
**Then** le formulaire tient en une colonne, le récapitulatif passe sous le formulaire
**And** les critères d'acceptation des stories 1.3, 1.4, 1.5 et 1.7 restent satisfaits : clôture J-10, horodatage de la version des documents acceptés, formats refusés avec message clair.

### Story 9.5: Résultats refondus

As a proche d'un coureur,
I want retrouver un coureur et lire son temps sans effort,
So that je suive la course depuis mon téléphone.

**Acceptance Criteria:**

**Given** la page `apps/web/src/app/resultats/`
**When** la refonte est appliquée
**Then** la recherche par nom ou dossard, le filtre d'épreuve et le filtre de catégorie sont visibles sans défilement sur mobile
**And** le tableau de classement reste lisible en écran étroit : conteneur à défilement horizontal propre, en-têtes de colonnes associés, places et temps en chiffres monospace alignés
**And** les mentions « Classement provisoire » et la fraîcheur des données restent affichées en toutes lettres (UX-DR-22, NFR-5)
**And** l'état vide avant départ affiche « Pas encore de partants — départ à HH:MM »

**Given** les critères des stories 7.1 et 7.2
**When** la page est rafraîchie
**Then** aucun classement partiel incohérent n'est exposé (NFR-4)
**And** le paramètre de suivi anonyme des partages continue d'être compté côté serveur (FR-16, SM-5).

### Story 9.6: Non-régression de la vitrine refondue

As a responsable de la mise en ligne,
I want la preuve chiffrée que la refonte n'a rien dégradé,
So that la vitrine reste utilisable sur un téléphone d'entrée de gamme en 3G.

**Acceptance Criteria:**

**Given** les quatre écrans refondus par les stories 9.2 à 9.5
**When** la mesure de performance est passée
**Then** le premier chargement de l'accueil reste sous 300 Ko et le premier rendu lisible sous 5 s en 3G lent, mesure consignée écran par écran (NFR-2, UX-DR-40)
**And** aucune police supplémentaire n'est chargée au-delà de celles déjà servies, et les SVG décoratifs sont inlinés plutôt que requêtés

**Given** le plancher d'accessibilité UX-DR-23
**When** chaque écran refondu est audité
**Then** le focus est visible à 2 px sur tout élément interactif, les cibles font au moins 44 px et ne touchent jamais le bord, l'écart entre deux cibles est d'au moins 8 px
**And** tous les textes passent le contraste AA, y compris les libellés gris de petite taille — un ratio de 4,3:1 est un échec, pas un arrondi
**And** le zoom navigateur à 200 % ne provoque ni perte de contenu ni défilement horizontal, et le pincement n'est jamais désactivé
**And** `prefers-reduced-motion` neutralise toutes les transitions ajoutées par la refonte (UX-DR-41)
**And** le document `_bmad-output/implementation-artifacts/scenarios-recette-epic-2.md` est réaligné sur les écrans refondus — les étapes qui désignent un élément disparu sont corrigées, pas supprimées.


## Epic 10: Refonte des surfaces d'exploitation

Les trois outils du jour J — PWA volontaires, app coureurs, back-office — passent sur le vocabulaire visuel posé par la story 9.1, et les écarts aux spécifications UX déjà validées sont corrigés au passage. Ces surfaces ne sont pas publiques : la priorité y est la lisibilité en plein soleil, au bout du bras, avec des gants, et non l'effet.

Référence visuelle : artboards `Volontaires`, `VolontairesScan`, `CoureurEdossard`, `CoureurSuivi`, `AdminDossiers` des maquettes du 2026-11-02.

**Dépendance :** la story 9.1 doit être livrée — c'est elle qui fournit le socle de classes.

### Story 10.1: PWA volontaires refondue

As a volontaire en poste au ravitaillement,
I want voir d'un coup d'œil ma mission, l'état de mes envois et le résultat de mon dernier scan,
So that je ne m'arrête jamais pour comprendre mon écran pendant qu'un coureur attend.

**Acceptance Criteria:**

**Given** les écrans `apps/web/src/app/volontaires/` et `volontaires/scan/`, et leurs feuilles `volontaires.css` (446 lignes) et `scan.css` (273 lignes)
**When** la refonte est appliquée
**Then** les deux feuilles consomment le socle de la story 9.1 et ne portent plus que ce qui est propre à ces écrans
**And** la mission en cours, les missions à suivre et l'état de synchronisation sont hiérarchisés : la mission en cours domine l'écran, l'état de synchro reste visible en permanence sans masquer l'action (UX-DR-8)
**And** le bandeau de synchronisation affiche « ◷ N passages en attente » puis « ✓ envoyés — file : 0 », et le journal de synchro reste accessible en lecture seule

**Given** la spécification UX-DR-7, à laquelle l'écran de scan actuel déroge
**When** l'écran de scan est refondu
**Then** le voyant de résultat occupe une pastille d'au moins 96 px de haut en plein cadre, texte d'au moins 24 px en graisse 800, heure en monospace d'au moins 16 px
**And** les trois états sont distingués par la forme et le texte autant que par la couleur : succès, « ↻ DÉJÀ PASSÉ » avec l'heure du premier passage, « ⚠ DOSSARD INCONNU » avec le bouton d'appel direct au PC course
**And** le clignotement ne dépasse jamais un éclat par seconde, et le voyant est annoncé en `aria-live="assertive"`
**And** le viseur reste plein cadre avec les badges LIVE et heure posés sur un voile d'au moins 96 % d'opacité (UX-DR-6)

**Given** un appareil hors réseau
**When** le volontaire enchaîne les scans
**Then** le comportement hors-ligne est inchangé : file locale, confirmation en moins d'une seconde, aucun passage perdu (FR-13, NFR-1, NFR-3)
**And** les tests existants de la PWA et du service worker passent sans modification de leur intention — seuls les sélecteurs de markup sont réalignés.

### Story 10.2: App coureurs refondue

As a coureur en course,
I want lire mon dossard et ma progression sans réfléchir,
So that mon téléphone ne me coûte pas d'attention que je dois au sentier.

**Acceptance Criteria:**

**Given** les écrans `apps/runners/src/ecrans/` — `edossard.tsx`, `suivi.tsx`, `dossier.tsx`, `journal-sync.tsx`, `batterie.tsx` — et le thème de l'application
**When** la refonte est appliquée
**Then** le thème de l'app lit les tokens opérationnels de `packages/shared` sans valeur littérale résiduelle, mode sombre par défaut conformément à l'écran e-dossard existant
**And** l'e-dossard conserve son numéro à 74 px, la mention « HORS-LIGNE PRÊT » en monospace et le QR sur carte blanche à coins arrondis (UX-DR-9, FR-7)
**And** l'écran de suivi hiérarchise progression, position sur le tracé et journal de synchronisation, avec l'état du suivi (activé / désactivé / en pause) toujours lisible en haut d'écran
**And** les actions destructrices ou irréversibles — abandon, arrêt du suivi — sont distinctes des actions courantes par la forme, pas seulement par la couleur

**Given** un téléphone Android d'entrée de gamme, en plein soleil
**When** les écrans sont affichés
**Then** aucune information ne dépend du survol, les cibles font au moins 44 dp, les contrôles de pause et d'arrêt du scan au moins 64 dp (UX-DR-23, UX-DR-24)
**And** `prefers-reduced-motion` rend les transitions statiques

**Given** le e-dossard mis en cache
**When** l'appareil est hors réseau depuis trente jours
**Then** le QR reste lisible et l'écran reste complet (NFR-6) — la refonte ne touche ni au cache ni à la génération du code.

### Story 10.3: Back-office refondu

As a membre du comité d'organisation,
I want parcourir les dossiers et piloter la course sur des écrans denses mais lisibles,
So that je travaille vite sans me tromper de ligne.

**Acceptance Criteria:**

**Given** les écrans `apps/web/src/app/admin/` — dossiers, missions, course, sponsors, contenus, retour-images, rapports, volontaires — et leurs six feuilles CSS résiduelles
**When** la refonte est appliquée
**Then** les six feuilles admin convergent sur le socle de la story 9.1 ; la densité est obtenue par l'espacement, jamais en descendant sous le plancher de lisibilité
**And** les tableaux partagent un même gabarit : en-têtes associés, badges de statut en forme et en texte, dossards et heures en monospace alignés à droite, séparateurs discrets, conteneur à défilement horizontal en écran étroit
**And** les compteurs de tête de page (validés, à contrôler, acceptations manquantes, dossards attribués) sont lisibles sans survol et renvoient au filtre correspondant

**Given** le tableau de bord live de la story 5.1
**When** des données arrivent
**Then** la mise à jour ne provoque pas de clignotement complet de l'écran, la fraîcheur reste affichée en pied (UX-DR-12, NFR-5)
**And** l'alerte hors-délais conserve son texte intégral, sa période de clignotement d'au moins une seconde et ses actions « Appeler le secteur » et « Saisir l'abandon »

**Given** les tests d'écrans admin existants
**When** la suite est exécutée
**Then** elle passe : `missions-manager.test.tsx` et les tests de routes admin ne sont réalignés que sur les sélecteurs, jamais sur l'intention.

### Story 10.4: Non-régression des surfaces d'exploitation

As a responsable du jour J,
I want la preuve que la refonte n'a rien cassé de ce qui doit marcher sans réseau,
So that personne ne découvre un défaut au km 18 avec un coureur devant lui.

**Acceptance Criteria:**

**Given** les trois surfaces refondues par les stories 10.1 à 10.3
**When** le parcours hors-ligne est éprouvé de bout en bout
**Then** retrait, scan de passage, file d'attente, reprise de réseau et synchronisation par lots fonctionnent à l'identique (FR-8, FR-13, FR-14)
**And** la confirmation de scan reste sous une seconde sur le repli iOS Safari (NFR-1)
**And** aucun actif nouvellement introduit par la refonte n'échappe au service worker : un écran refondu chargé hors-ligne n'affiche jamais de style manquant

**Given** le plancher d'accessibilité UX-DR-23
**When** chaque écran d'exploitation est audité
**Then** focus visible, cibles d'au moins 44 px jamais au bord, écart d'au moins 8 px, contrastes AA y compris en mode sombre, icônes labellisées, décorations `aria-hidden`
**And** les trois canaux de retour du scan — visuel, sonore, vibration — restent distincts et testés (UX-DR-6)
**And** les documents `scenarios-recette-epic-3.md`, `-4.md` et `-5.md` sont réalignés sur les écrans refondus.


## Epic 11: Le parcours en 3D

Le visiteur voit la course avant de la courir : pipeline build-time GPX → `parcours.json` avec porte de qualité, carte MapLibre à relief terrarium reprenant les motifs de `poc/index.html`, profil altimétrique coloré par pente, curseur partagé carte ↔ profil par l'abscisse curviligne `s`, attributions permanentes, fond cartographique arbitré, deux épreuves sur géométrie partagée.

**Dépendance :** la story 9.3 fournit la coquille et le contrat de données. La story 11.2 conditionne 11.3 à 11.6 : tant que le fond de production n'est pas arbitré, rien ne part en ligne.

**Relevés de référence :** `docs/GPX/activity_24920331005.gpx` (exploitable — 26 933 points, pas médian 1 s, boucle fermée) et `docs/GPX/activity_24827718657.gpx` (contre-exemple — 598 points, 69 % de la distance en segments > 30 s).

### Story 11.1: Pipeline GPX vers parcours.json

As a organisateur qui relève le tracé sur le terrain,
I want transformer mon export GPX en données de parcours vérifiées,
So that le site publie des chiffres dont je réponds, et refuse un relevé qui n'en vaut pas la peine.

**Acceptance Criteria:**

**Given** un export GPX manuel versionné dans `docs/GPX/`, avec altitude barométrique embarquée
**When** le pipeline est exécuté
**Then** il produit `parcours.json` : géométrie de base une seule fois, vues d'épreuve, `profile[[dist_m, alt]]`, points de passage et métadonnées (FR-28)
**And** l'altitude est lue dans le GPX, jamais échantillonnée depuis le modèle numérique de terrain — le relief ne sert plus qu'au rendu
**And** les points à vitesse implausible sont rejetés, le bruit lissé, les distances cumulées calculées, le D+ et le D− produits globalement et par segment entre points de passage
**And** le seuil d'accumulation du D+ est une constante unique du pipeline, documentée dans le code avec son effet chiffré — sur le premier relevé d'essai, le D+ passe de 641 m brut à 604 m au seuil de 5 m, soit 6 % d'écart pour une constante arbitraire

**Given** la porte de qualité (FR-28b)
**When** un relevé hors seuils est soumis
**Then** le pipeline le refuse ou le signale en nommant le défaut — pas médian, part de la distance en segments de plus de 30 s, nombre de points à vitesse implausible — jamais un échec muet
**And** `activity_24827718657.gpx` est refusé par cette porte, `activity_24920331005.gpx` est accepté : les deux cas sont couverts par un test

**Given** deux épreuves partageant départ, arrivée et une portion de sentier (FR-38)
**When** le pipeline produit les vues d'épreuve
**Then** `s` est calculé par épreuve et jamais globalement
**And** chaque point de passage porte une identité unique sur la géométrie de base — celle partagée avec l'entité CHECKPOINT de l'épopée 4 — et un kilométrage distinct par épreuve traversée, plus ses services (FR-39)
**And** les points de passage du POC, posés arbitrairement tous les 7 km, ne sont pas repris comme ravitaillements réels

**Given** un tracé annoncé publiquement
**When** une évolution du tracé est nécessaire
**Then** elle produit une nouvelle version explicite de `parcours.json`, jamais une modification silencieuse.

### Story 11.2: Fond cartographique de production et attributions

As a organisation qui vend des inscriptions et affiche des sponsors,
I want un fond de carte dont le droit d'usage couvre réellement notre situation,
So that la carte ne devienne jamais un problème juridique à trois semaines de la course.

**Acceptance Criteria:**

**Given** la note licences, dont le paragraphe 3 conditionne EOX Sentinel-2 cloudless au caractère strictement non monétisé du projet, et Azzel qui a déjà des inscriptions payantes (FR-4) et un bloc sponsors visible (FR-22)
**When** l'arbitrage est rendu
**Then** une décision tracée retient l'une des options — ArcGIS Location Platform avec clé, fournisseur payant, ou OpenTopoMap seul sans fond satellite — avec son coût, son plafond d'usage et sa clause de monétisation cités (FR-33)
**And** les endpoints Esri sans clé du POC ne partent pas en production
**And** la clé éventuelle est tenue hors du dépôt et restreinte au domaine de production

**Given** les fonds disponibles et le relief terrarium
**When** une carte est affichée
**Then** un bloc d'attributions est visible en permanence, adapté au fond actif, au texte conforme au paragraphe 5 de la note licences (FR-32)
**And** il n'est jamais superposé à du contenu, reste lisible au contraste AA, et le déploiement d'un détail ne fait pas disparaître la mention courte (UX-DR-29).

### Story 11.3: Carte 3D du parcours

As a coureur qui prépare sa course,
I want voir le relief que je vais traverser,
So that je comprenne l'effort avant de m'inscrire.

**Acceptance Criteria:**

**Given** la coquille de la story 9.3, le `parcours.json` de la story 11.1 et le fond arbitré de la story 11.2
**When** la carte est intégrée
**Then** elle reprend les motifs de `poc/index.html` : MapLibre GL JS, relief terrarium en `raster-dem` posé par `setTerrain`, tracé officiel de l'épreuve active, bascule entre fond satellite et fond topographique, `NavigationControl` avec visualisation du tangage (FR-29)
**And** les points de passage sont des pastilles numérotées sur la trace, ouvrant au tap comme au clavier une fiche donnant nom, kilomètre, altitude, D+ du segment amont et services en icône et en texte (UX-DR-26)
**And** la barre de contrôles est faite de chips labellisés — bascule 3D, survol, exagération du relief, choix du fond — accompagnés de la source du relief et d'une indication explicite de l'interaction (glisser pour pivoter, molette pour zoomer) ; cibles d'au moins 44 px, jamais collées au bord de l'écran (UX-DR-25, UX-DR-37)
**And** la carte ne charge pas dans le chemin critique : elle est différée après le contenu textuel, et le budget de l'accueil reste tenu (NFR-2)

**Given** un navigateur sans WebGL ou des tuiles injoignables
**When** la page est ouverte
**Then** le bloc parcours textuel de la story 9.3 reste affiché et un message explique l'indisponibilité — jamais un cadre vide (UX-DR-30).

### Story 11.4: Profil altimétrique et graphe de technicité

As a coureur qui lit un profil,
I want voir où ça monte, où ça descend et à quel point c'est raide,
So that je règle mon allure avant de partir.

**Acceptance Criteria:**

**Given** les couples `(s, altitude)` de `parcours.json`
**When** le profil est rendu
**Then** il est dessiné en SVG lisible d'abord sur téléphone, avec les points de passage repérés et les bornes de segment donnant kilomètre et D+ (FR-30)
**And** l'aire sous la courbe est colorée par pente selon une échelle verrouillée : moins de 5 % roulant, 5 à 12 % soutenu, 12 à 20 % raide, plus de 20 % très raide (UX-DR-36)
**And** la légende donne chaque palier en trait et en toutes lettres ; les quatre teintes diffèrent aussi en clarté, de sorte qu'un daltonien ou une impression en niveaux de gris restent lisibles
**And** la lecture est possible au survol comme au tap — aucune information ne dépend du survol (UX-DR-27)
**And** les valeurs sous le curseur sont annoncées en texte accessible : kilomètre, altitude, pente.

### Story 11.5: Curseur partagé et bascule d'épreuve

As a visiteur qui explore le parcours,
I want que la carte et le profil se répondent,
So that je sache à quel endroit du terrain correspond la bosse que je regarde.

**Acceptance Criteria:**

**Given** la carte de la story 11.3 et le profil de la story 11.4
**When** le visiteur survole ou touche le profil
**Then** un repère se déplace sur la carte à la position correspondante, et réciproquement (FR-31)
**And** `s` est l'unique variable d'état partagée entre les deux surfaces — aucune autre donnée n'est synchronisée

**Given** deux épreuves sur géométrie partagée
**When** le visiteur bascule d'épreuve dans le sélecteur de la story 9.3
**Then** carte, profil, synthèse et points de passage basculent ensemble
**And** sur la portion commune, un même point de passage affiche le kilomètre de l'épreuve active, et l'épreuve active reste visible au contact du kilométrage : aucun chiffre n'est jamais orphelin de son référentiel (UX-DR-31)
**And** la bascule se lit comme voulue, jamais comme un défaut d'affichage.

### Story 11.6: Confort de lecture du parcours

As a visiteur qui découvre le relief,
I want survoler le parcours et ajuster ce que je vois,
So that je me fasse une idée du terrain sans savoir manipuler une carte.

**Acceptance Criteria:**

**Given** la carte et le profil livrés
**When** le survol animé est déclenché
**Then** la caméra est paramétrée par `s`, le démarrage et l'arrêt sont explicites, et rien ne démarre tout seul (FR-34)
**And** `prefers-reduced-motion` neutralise le survol et les transitions de caméra (UX-DR-30)

**Given** les contrôles de rendu
**When** le visiteur les manipule
**Then** l'exagération verticale est réglable entre 1,5 et 2, avec une valeur par défaut documentée, et la bascule 3D rend par `setTerrain(null)` une carte 2D pleinement fonctionnelle (FR-35)
**And** le bandeau du profil est repliable : en-tête cliquable, résumé kilomètres / D+ / nombre de points quand il est replié, état mémorisé, carte correctement redimensionnée au basculement (FR-36, UX-DR-28)

**Given** le périmètre Should de cette story
**When** l'arbitrage de la story 11.2 interdit le fond visé ou que le calendrier se tend
**Then** cette story est coupée sans toucher aux stories 11.1 à 11.5.

### Story 11.7: Barrières horaires sur le parcours

As a coureur qui part sur l'épreuve longue,
I want savoir à quelle heure je dois être passé où,
So that je sache si je suis dans les temps avant qu'on me le dise.

**Acceptance Criteria:**

**Given** les points de passage de l'édition
**When** une barrière horaire est définie
**Then** elle porte une heure limite par point de passage et par épreuve, visible sur le profil et dans la fiche du point de passage (FR-37)
**And** le modèle retenu — rattachement à l'entité CHECKPOINT de l'épopée 4 ou entité propre — est tranché et documenté dans cette story

**Given** que l'épopée 4 est en recette
**When** cette story modifie le modèle de données des points de passage
**Then** l'impact sur les écrans de scan et sur l'arbitrage serveur des passages est évalué et nommé avant toute migration
**And** aucune modification ne casse les critères d'acceptation des stories 4.3, 4.4 et 4.5 — la dépendance est portée ici, pas rouverte là-bas.
