---
name: 'review-adversarial-architecture-spine'
type: adversarial-review
target: ARCHITECTURE-SPINE.md (Azzel, 2026-10-19, updated 2026-10-20)
date: '2026-10-20'
method: >-
  Construire deux unités du niveau inférieur (modules serveur + apps) dont chacune obéit À LA LETTRE
  à toutes les AD de la spine, mais qui produisent des systèmes incompatibles. Chaque collision est
  un trou à fermer par une AD nouvelle ou resserrée. Les lectures citées sont toutes conformes :
  c'est précisément le problème.
status: final
---

# Revue adversariale — Architecture Spine Azzel

## 0. Méthode et paires construites

Quatre binômes d'unités ont été joués l'un contre l'autre, chacun respectant intégralement AD-1 à AD-6, les conventions et la capability map :

| Binôme | Unité A | Unité B |
| --- | --- | --- |
| P1 | Module serveur `chrono` (passages, classements) | PWA scan volontaires (`apps/web`) |
| P2 | Module serveur `tracking` (positions) | App coureurs `apps/runners` (Expo) |
| P3 | Module serveur `admin` (PC course) | Module serveur `iam` (sessions) |
| P4 | Module serveur `vitrine` (public) | Modules `inscriptions` + `chrono` (e-dossard, annuaire) |

Huit collisions ont été produites. Aucune ne viole une AD : chaque unité peut citer la phrase exacte de la spine qui autorise sa lecture. La spine tranche « qui gagne » pour les Passages (AD-3) mais reste muette — ou ambiguë — pour les Positions, les Abandons, l'horloge du temps de course, le canal public et les identités de coureur.

---

## Attaque 1 — La session unique exécute le tracking

**Unités :** `iam` (serveur) × `tracking`/`apps/runners`.

**Lecture conforme A (iam).** AD-5 : « toute nouvelle connexion révoque les sessions antérieures du compte, **web et natif confondus**. Appliqué à l'émission, pas côté client. » Le module iam émet des jetons courts et révoque tout le parc de sessions du compte à chaque nouvelle connexion, sans distinction d'appareil ni de contexte. FR-1 confirme : « La session unique s'applique à tous les rôles (coureur, volontaire, admin). »

**Lecture conforme B (tracking/runners).** AD-1 : le tracking GPS arrière-plan vit dans l'Expo. AD-2 : positions en outbox append-only, poussées par lots idempotents. L'app enregistre et pousse — elle « propose », le serveur « dispose ». Rien à redire.

**Collision.** Le matin du jour J, Malika… non : Yacine, coureur opt-in tracking, ouvre son espace coureur **web** à 7 h pour vérifier son e-dossard (comportement explicitement attendu : AD-1 place l'espace coureur web et l'app native chez le même utilisateur). La connexion web révoque la session native. À partir de 7 h 01, l'outbox de `apps/runners` pousse en 401 en boucle. Le coureur est en zone blanche : la ré-authentification exige **un code par email** (convention auth) — impossible en montagne. Résultat : plus aucune position du coureur pendant toute la course ; FR-18/19, alertes FR-25 et carte publique s'éteignent pour lui, alors que chaque module a respecté ses AD. AD-5 et AD-2/AD-1 sont en guerre ouverte et la spine ne le voit pas.

**AD proposée (resserrer AD-5).** Distinguer deux artefacts : la **session interactive** (unique par compte, révoquée à chaque nouvelle connexion interactive — l'invariant anti-compte-partagé tient) et la **capacité de synchronisation d'appareil** (autorisation par appareil, délivrée à l'activation du tracking, non révoquée par une connexion interactive ailleurs pendant une édition active, révocable explicitement par le coureur ou l'organisateur). AD-5 doit l'énoncer : « session unique interactive ; jetons de sync par appareil cloisonnés ».

---

## Attaque 2 — Les Positions n'ont pas de juge (AD-3 s'arrête aux Passages)

**Unités :** `tracking` (serveur) × `apps/runners` + `vitrine`.

**Lecture conforme A (tracking).** AD-2 : la position est un événement append-only, clé `appareil+entité+identifiant naturel`. Le module tracking choisit comme identifiant naturel **l'horodatage de capture appareil** et ordonne le flux par horodatage appareil corrigé de l'offset (AD-3 : « l'offset estimé est journalisé » — rien n'interdit de l'utiliser). « Dernière position connue » (FR-19) = max(horodatage appareil corrigé).

**Lecture conforme B (vitrine/tracking-lecture-serveur).** AD-3 : « l'ordre d'arrivée serveur tranche ; les horloges clientes n'ont jamais le dernier mot. » L'esprit est clair : seule l'horloge serveur fait foi. La vitrine trie donc les positions par `reçu_at` serveur. « Dernière position connue » = max(reçu_at).

**Collision.** AD-3 est rédigée uniquement « pour un même coureur+checkpoint » — les Passages. Pour les Positions, aucune règle. Cas réel : le téléphone d'un coureur meurt à mi-course ; il emprunte celui de son binôme (ou récupère du réseau 3 h plus tard sur son ancien appareil). Le serveur reçoit **deux flux d'appareils légitimes** pour le même coureur, avec des horloges divergentes. Lecture A : la position « la plus récente » selon l'horloge appareil corrigée peut revenir en arrière (l'ancien téléphone rejoue des captures antérieures après coup et écrase la position fraîche du nouveau). Lecture B : c'est l'ordre de réception qui prime. Les deux affichages de la carte publique (FR-19) divergent, et l'estompement « plus vieilles que 1 h » change de résultat selon l'horloge retenue. De plus, clé d'idempotence `appareil+horodatage` : une correction d'horloge NTP en cours de course (deux captures dans la même seconde arrondie) fait fusionner deux positions — une disparaît, en violation du « zéro perdu ».

**AD proposée (étendre AD-3).** Généraliser l'invariant : « Pour toute entité événementielle temporelle, l'ordre de réception serveur fait autorité. La dernière position affichée d'un coureur est l'événement Position de réception serveur la plus récente ; l'horodatage appareil est une donnée d'affichage, jamais une clé de tri. L'identifiant naturel d'une Position = (appareil, séquence monotone locale), jamais un horodatage brut. »

---

## Attaque 3 — L'Abandon a deux propriétaires et deux canaux de mutation

**Unités :** module `admin` (PC, en ligne) × PWA volontaires (hors-ligne) × module `chrono`.

**Lecture conforme A (admin/PC).** FR-17 : « L'organisation (PC ou volontaires) peut saisir un abandon. » Le PC est un client web en ligne du monolithe server-authoritative ; AD-2 ne régit que « toute donnée de **terrain** » et n'interdit les mutations directes qu'aux « appareils ». Le PC écrit donc l'abandon en base comme mutation classique (table `abandon` ou champ statut sur le coureur — l'ER de la spine **ne contient aucune entité ABANDON**, donc admin choisit : colonne `statut` sur COUREUR).

**Lecture conforme B (PWA volontaires).** AD-2 : « toute donnée de terrain (Passage, **abandon**, position) est un événement inséré localement en append-only. » Le volontaire au checkpoint 4 saisit l'abandon hors-ligne ; c'est un événement outbox, rejouable, poussé à 14 h.

**Collision.** Trois écritures de la même réalité, trois formats : événement append-only (volontaire), mutation en ligne (PC), déduction (chrono : coureur ayant franchi l'arrivée = « arrivé »). Scénario : abandon saisi au checkpoint 4 par le volontaire à 11 h 00 (hors-ligne) ; à 12 h 30, le PC voit « hors-délais » (FR-25), appelle, marque le coureur « hors course » avec un autre motif en base ; à 14 h le lot du volontaire sync et rejoue un abandon contradictoire (heure, lieu, motif différents). Aucune AD ne dit lequel gagne, dans quel ordre s'appliquent des écritures arrivées par des canaux différents, ni quelle est la forme canonique de l'abandon. Pendant ce temps, le classement (FR-15 : « le coureur sort des calculs ») et le tableau PC (FR-24) peuvent afficher deux statuts distincts pour le même coureur — chacun déduit par un module différent. Trois propriétaires légitimes, zéro désigné.

**AD proposée (nouvelle AD-7 — cycle de vie en course).** « Le statut en course d'un coureur (partant → en course → arrivé/abandonné/hors-délais/disqualifié) est une machine à états possédée par le module `chrono`, exclusivement alimentée par des **événements horodatés** insérés dans un journal unique (Passage, Abandon, Départ). Le PC et les volontaires produisent des événements dans ce journal — le PC via des événements horodatés serveur, les volontaires via l'outbox — jamais des mutations directes de statut. Tout affichage (PC, vitrine, classement) est une projection de cette machine. »

---

## Attaque 4 — « Identifiant naturel » du Passage : la PWA et le serveur ne lisent pas la même clé

**Unités :** module `chrono` (serveur) × PWA scan.

**Lecture conforme A (PWA scan).** FR-13 : « Doublon même coureur/même checkpoint : voyant rouge, Passage non dupliqué. » La PWA en déduit que l'identifiant naturel d'un Passage est le couple **(coureur, checkpoint)** [+ appareil par AD-2]. Elle refuse donc tout second scan du couple, même correctif — conforme au PRD à la lettre.

**Lecture conforme B (chrono serveur).** AD-2 : clé d'idempotence `appareil+entité+identifiant naturel` ; AD-3 : « le premier Passage reçu serveur compte ; les suivants sont archivés et neutres. » Le serveur lit donc que plusieurs Passages du même couple coureur+checkpoint **existent** (ils sont « archivés ») : l'identifiant naturel est l'identité du **scan** (UUID), pas du couple. Idempotence = rejeu de lot uniquement.

**Collision, en trois temps.** (1) Sémantiques de doublon divergentes : côté PWA un second scan est impossible à saisir, côté serveur il est prévu et archivé — un scan de rattrapage après un scan accidentel prématuré (volontaire déclenche avant le franchissement réel) est bloqué à la source, sans aucune voie de correction : la spine ne prévoit nulle part l'invalidation d'un Passage erroné, alors que l'outbox est append-only et le serveur juge unique. (2) Le couple « coureur » : la spine ne fixe pas si l'identité du coureur dans la clé est le **numéro de dossard** (étiquette visible, ce que scanne le guichet) ou un **identifiant immuable coureur×édition**. Si `inscriptions` corrige/réattribue un dossard à J-2 (erreur de saisie, série réorganisée), les Passages déjà scannés au retrait (FR-8) sous l'ancien dossard et ceux scannés le jour J sous le nouveau forment **deux identités de Passage pour un coureur** — AD-3 (« pour un même coureur+checkpoint ») devient indécidable, le dédoublonnage cross-appareils (FR-14) échoue silencieusement. (3) Comptabilité SM-2 : la PWA affiche « 217 envoyés », le serveur en neutralise N — aucun AD ne régit le retour d'information du sort de chaque événement vers l'appareil.

**AD proposée (resserrer AD-2).** « L'identifiant naturel d'un Passage = (appareil, checkpoint, identifiant immuable coureur×édition). Le numéro de dossard est un libellé d'affichage, jamais une clé, et est gelé au préchargement de l'annuaire. Toute correction s'effectue par événement d'invalidation motivé (append-only, émis par le PC), jamais par suppression. Le serveur retourne le verdict de chaque événement du lot (comptant / archivé / rejeté) à l'appareil. »

---

## Attaque 5 — Quelle horloge fonde le temps de course ? Trois lectures, deux classements

**Unités :** module `chrono` (calcul) × module `vitrine` (affichage live).

**Lecture conforme A (chrono).** AD-3 : « l'horodatage appareil est conservé comme donnée, l'offset estimé (référence serveur à la sync) est journalisé. » « Journalisé » n'est pas « appliqué » : chrono peut légitimement fonder le temps de course sur l'horodatage appareil brut — argument sportif imparable : c'est la mesure la plus proche du franchissement réel.

**Lecture conforme B (vitrine).** AD-3 : « l'ordre d'arrivée serveur tranche ; les horloges clientes n'ont **jamais** le dernier mot. » FR-16 : « un rafraîchissement n'expose jamais de classement partiel incohérent (**ordre par temps réels**). » La vitrine en déduit que la seule horloge de confiance est serveur : elle ordonne par réception serveur.

**Collision.** Checkpoint 2 : coureur X scanné 10:07:58 appareil (offset +45 s), reçu serveur 13:02 ; coureur Y scanné 10:08:10 (offset −30 s), reçu 12:58. Classement A (appareil) : X devant Y. Classement B (serveur) : Y devant X. **Les deux sont conformes à AD-3**, qui ne tranche que le doublon, pas la mesure. Et le trou se creuse : FR-15 exige des **départs échelonnés** — le temps de course = horodatage de passage − heure de départ. Or aucune entité DEPART n'existe dans l'ER, aucune AD ne désigne la source de vérité de l'**heure de départ réelle** (le départ réel d'une édition de 1 000 coureurs peut dériver de plusieurs minutes par rapport au prévu). Lecture A utilise l'heure prévue (config), le PC saisit l'heure réelle à la ligne de départ… pour quelle épreuve, dans quelle table, propriété de quel module ? À la minute près, des places entières du classement (et la barrière horaire FR-25) basculent.

**AD proposée (resserrer AD-3).** « Le temps de course officiel = horodatage appareil du Passage retenu, corrigé de l'offset estimé, moins l'heure de départ réelle de l'épreuve (événement serveur saisi au PC, propriété de `chrono`). Il est calculé une fois, par `chrono` seul, et publié comme projection ; aucun autre module (vitrine, admin) ne recalcule ni ne réordonne par sa propre horloge. »

---

## Attaque 6 — La lecture publique anonyme perce la RLS et explose le budget realtime

**Unités :** module `vitrine` (public, sans compte) × module `tracking` (données positions).

**Lecture conforme A (vitrine).** AD-1 : vitrine publique sans compte. Capability map : « Chrono & résultats : … + **realtime** ». Stack : « realtime 200 conn ». La vitrine s'abonne donc directement au canal realtime Supabase avec la clé `anon` et une policy RLS `SELECT` sur une vue filtrée — AD-4 est respectée à la lettre : la RLS est « appliquée comme contrainte structurelle » ; la spine n'interdit que « l'accès direct client avec rôle **service** » ; `anon` n'est pas `service`.

**Lecture conforme B (tracking).** AD-4 : « chaque table métier porte `organisation_id` », RLS sur POSITION. Tracking applique la policy par organisation et expose la donnée — en s'appuyant sur la couche au-dessus pour le public.

**Collision.** (1) La carte publique doit montrer « chaque coureur que par son numéro de dossard » avec estompement à 1 h (FR-19) : cette logique doit vivre soit dans la vue SQL (l'estompement temporel en policy RLS est au mieux contorsionnique), soit dans l'agrégat serveur — les deux unités la codent à deux endroits et divergent. (2) SM-5 pousse au **partage massif** des URLs de résultats : chaque visiteur = une connexion realtime ; à 200+ spectateurs sur un pic médiatique, le free tier s'effondre **le jour J** — la collision est opérationnelle, pas seulement logique. (3) Location d'instances post-V1 : le dossard est unique par édition, pas globalement ; la carte publique identifiant par dossard nu, deux organisations avec un dossard 217 entrent en collision dans tout identifiant public — AD-4 régit l'isolation en **écriture/lecture authentifiée**, rien sur le chemin de **lecture publique**. (4) Une policy `anon` SELECT sur des tables métier est une frontière tenant par filtre : la première fuite de données inter-organisations attendra ce coin-là.

**AD proposée (nouvelle AD-8 — canal public).** « Les surfaces sans compte n'accèdent jamais directement à la base ni au realtime. Le module `vitrine` publie une projection publique agrégée côté serveur (positions estompées, résultats, identité limitée à `édition+dossard`), servie par l'API/rendu serveur avec son propre budget. Le realtime Supabase est réservé aux sessions authentifiées (admin, PC, espaces coureurs/volontaires). »

---

## Attaque 7 — L'annuaire des coureurs : une réplique de lecture sans maître de version

**Unités :** PWA scan (consommatrice) × modules `inscriptions`/`chrono` (producteurs).

**Lecture conforme A (PWA scan).** Convention scan : « annuaire coureurs préchargé en IndexedDB » ; FR-12 : préchargé **avant le départ** ; FR-13 : validation **contre l'annuaire local**, « le scan d'un coureur inconnu affiche un voyant rouge explicite ». La PWA valide donc exclusivement contre sa copie locale, quelle que soit son ancienneté — conforme.

**Lecture conforme B (inscriptions/chrono).** AD-2/AD-3 ne fixent **aucun gel** des dossiers ; FR-4 laisse l'organisateur valider des preuves jusqu'à la course ; la question ouverte n° 4 (inscription sur place, « à trancher avant le 15/11/2026 ») peut ajouter des coureurs après le préchargement. Les deux modules continuent donc légitimement de muter la population des coureurs validés jusqu'au dernier moment.

**Collision.** Coureur validé à J-1 (preuve CCP validée le soir) : absent de l'annuaire préchargé → voyant rouge au checkpoint → le volontaire, formé pour « scanner vite et juste » (UJ-2), le rejette ou le saisit en quarantaine non spécifiée → Passage perdu, en contradiction frontale avec SM-2 (« zéro Passage perdu »). Réciproquement : dossard corrigé à J-2 → l'annuaire local mappe les scans sur le mauvais coureur, et AD-3 dédoublonne sur une fausse identité. La spine traite l'annuaire comme un détail d'implémentation (une ligne de convention), alors que c'est une **réplique de lecture des données d'un autre module**, dont rien ne régit la fraîcheur, la version, ni le protocole de re-synchronisation — et dont dépend l'intégrité du chrono.

**AD proposée.** « L'annuaire est une projection versionnée possédée par `chrono`, épinglée à une étape d'édition, avec étiquette de version affichée sur l'appareil, fenêtre de re-synchronisation obligatoire jusqu'au départ réel, et règle d'usage : voyant rouge = signal, jamais rejet définitif — le Passage est enregistré en quarantaine et tranché par le serveur (AD-2 : l'appareil propose). »

---

## Attaque 8 — L'e-dossard : deux apps, deux payloads, aucune signature

**Unités :** `apps/web` (QR cache image) × `apps/runners` (QR natif) × module `chrono` (scanneur).

**Lecture conforme A (web/inscriptions).** FR-7 : e-dossard QR hors-ligne, « le QR reste lisible après 30 jours de cache ». Capability map : e-dossard & retrait sous `chrono`, mais le QR **naît** de la validation du dossier (FR-4/5 → FR-7) — inscriptions génère donc le payload à la validation et choisit l'évident : le **numéro de dossard** (lisible par un humain, cohérent avec le dossard physique, imprimable).

**Lecture conforme B (runners).** AD-1 : e-dossard dans l'app native. AD-6 : les contrats partagés vivent dans `shared` — mais la spine ne nomme jamais le **contenu** du QR parmi « types de domaine, client sync, schémas de validation et constantes ». L'app choisit un **UUID opaque** (non devinable, immuable même si le dossard change — voir attaque 4).

**Collision.** (1) Deux payloads pour la même fonction : chaque scanneur (BarcodeDetector, fallback zxing) doit décoder deux formats, l'annuaire doit porter les deux identifiants, et la clé d'idempotence AD-2 change de signification selon le payload scanné. (2) **Falsifiabilité** : si le payload est le dossard nu, n'importe qui imprime un QR « 217 » — faux retrait de dossard (FR-8), faux passages indétectables (AD-2/AD-3 n'ont aucune notion d'authenticité : « l'appareil propose, le serveur dispose » — le serveur dispose, mais il ne peut pas distinguer un coureur d'un QR forgé ; la réputation, produit déclaré du projet, est en jeu). (3) Deux propriétaires légitimes du même artefact (inscriptions le fabrique, chrono le consomme, deux apps l'affichent) sans contrat désigné.

**AD proposée (resserrer AD-6).** « Le contrat du QR e-dossard vit dans `packages/shared` : payload unique, opaque (identifiant immuable coureur×édition, signé ou doté d'une empreinte vérifiable hors-ligne), versionné. La génération est exclusive au module propriétaire à la validation du dossier ; toute surface (web, natif, scanneur) ne fait que rendre ou décoder ce contrat. Le numéro de dossard est une donnée de l'annuaire, jamais le contenu du QR. »

---

## Synthèse

| # | Trou | AD(s) touchée(s) | Gravité jour J |
| --- | --- | --- | --- |
| 1 | Session unique tue le tracking (web consulté → natif révoqué, re-auth impossible en zone blanche) | AD-5 × AD-1/2 | Critique — suivi de sécurité perdu |
| 2 | Positions sans juge : ordre appareil vs serveur indécidable, clé = horodatage fragile | AD-3 (absente) × AD-2 | Majeure — carte publique fausse |
| 3 | Abandon : deux canaux, trois déductions, aucune machine à états propriétaire | AD-2 × AD-3 (absente), ER | Critique — classements et PC contradictoires |
| 4 | « Identifiant naturel » du Passage lu différemment ; dossard en clé ; aucune voie de correction | AD-2/AD-3 | Critique — intégrité chrono |
| 5 | Horloge du temps de course non tranchée ; heure de départ réelle sans propriétaire | AD-3 × FR-15/16 | Critique — deux classements conformes |
| 6 | Lecture publique anonyme : RLS percée pour `anon`, realtime 200 conn, dossard nu non unique inter-tenants | AD-4 × AD-1, stack | Majeure — chute de service + fuite |
| 7 | Annuaire : réplique sans version ni protocole de fraîcheur | AD-2/AD-3 (convention scan) | Majeure — SM-2 compromis |
| 8 | QR e-dossard : contrat absent de `shared`, deux payloads, falsifiable | AD-6 × AD-1 | Majeure — fraude + réputation |

**Lecture d'ensemble.** Le paradigme tient (« l'appareil propose, le serveur dispose »), mais les AD s'arrêtent exactement à la frontière où deux équipes conformes divergent : AD-3 tranche les doublons de Passage et se tait sur tout le reste du temporel (positions, abandons, départs, temps de course) ; AD-2 fixe la forme de la clé d'idempotence sans en fixer le contenu ; AD-5 est rédigée sans considérer l'arrière-plan natif ; AD-4 régit l'écriture et laisse la lecture publique inventer son chemin ; AD-6 énumère les contrats de `shared` sans nommer les deux plus chargés (QR, annuaire). Recommandation : durcir AD-2, AD-3, AD-5, AD-6 et créer AD-7 (cycle de vie en course) et AD-8 (canal public) **avant** la génération des epics — toutes les propositions de textes sont prêtes ci-dessus.
