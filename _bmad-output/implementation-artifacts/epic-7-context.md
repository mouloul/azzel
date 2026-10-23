# Epic 7 Context: La course visible de l'extérieur

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rendre la course lisible depuis l'extérieur, en direct et après coup : classements justes par épreuve (départs échelonnés), résultats partageables sur la vitrine publique, carte anonyme des positions, et rapports chiffrés pour le directoire. C'est l'épopée de la réputation : la vitrine convertit la réussite terrain (chrono, tracking) en crédibilité auprès de la fédération, des médias, des sponsors et des proches — la justification même du projet. Public cible : visiteurs sans compte (Malika depuis Tizi Ouzou, médias, fédération) et le directoire de l'organisation.

## Stories

- Story 7.1: Classements par épreuve et départs échelonnés
- Story 7.2: Résultats en direct partageables
- Story 7.3: Carte publique anonyme
- Story 7.4: Rapports post-course et export « commande »

## Requirements & Constraints

- **Classements** : un classement par épreuve, départs échelonnés gérés via des heures de départ officielles configurées côté serveur ; un coureur n'apparaît que dans le classement de son épreuve. Scratch obligatoire ; par sexe et catégories d'âge balisé `[ASSUMPTION: à confirmer — crédibilité fédération]`.
- **Intégrité** : un rafraîchissement n'expose jamais un classement partiel incohérent (ordre par temps réels). Le libellé « Classement provisoire » est affiché en toutes lettres — jamais « officiel » ni « temps réel ».
- **Résultats en direct** : mise à jour au fil de la synchronisation des Passages ; URLs partageables portant un paramètre de suivi anonyme compté côté serveur (objectif de portée, aucune donnée personnelle). État vide avant départ : « Pas encore de partants — départ à HH:MM ».
- **Anonymat public strict** : sur tous les canaux publics (résultats, carte), le seul identifiant exposé est le numéro de dossard qualifié par édition — jamais nom, contact ou photo.
- **Carte publique** : dernière position connue de chaque coureur opt-in sur le tracé GPX officiel + checkpoints ; positions de plus d'une heure estompées `[ASSUMPTION: X = 1 h]` ; la « dernière position connue » est affichée comme telle, sans inquiéter.
- **Rapports post-course** : un fichier unique couvrant l'édition complète (inscrits, présents, passages, arrivées, abandons, portée des partages). À J-10 (16/03/2027), un export « commande » fournit les décomptes validés par épreuve et par taille de t-shirt (médailles, t-shirts — zéro stock).
- **Fraîcheur** : toute donnée live affiche sa fraîcheur (« synchronisé il y a X min »), jamais présentée comme instantanée, même réseau dégradé.
- **Budget vitrine** : premier chargement < 300 Ko, premier rendu lisible < 5 s sur 3G lent ; la carte et le GPX ne chargent jamais dans le chemin critique.
- Abandons (épopée 5) : le coureur sort des calculs en cours mais reste dans les rapports.

## Technical Decisions

- **Canaux publics via backend uniquement** : toute réponse destinée au public anonyme transite par le backend Next.js (cache + SSE/polling) — jamais de lecture directe Supabase realtime depuis les navigateurs publics (plafond free tier : 200 connexions realtime) ; le realtime est réservé au portail admin.
- **Arbitrage serveur** : le premier Passage reçu par checkpoint fait foi pour le classement, les suivants sont archivés et neutres ; le scan au départ est un contrôle de présence, jamais une référence horaire de classement. Les classements (7.1) se calculent donc exclusivement côté serveur à partir des Passages arbitrés et des heures de départ officielles.
- **Modules** : classements dans `chrono`, résultats/carte dans `vitrine` (apps/web public), rapports/exports dans `admin`. Choix locaux non contraints : bibliothèque cartographique (Leaflet vs MapLibre) et rendu GPX côté `vitrine` ; format et moteur d'export côté `admin`.
- Chaque table métier porte `organisation_id` (RLS Postgres) ; les requêtes publiques passent par le backend, jamais en accès direct base.
- Horodatages ISO 8601 UTC stockés, affichage en heure locale. UI en français, code/identifiants en anglais.
- Séquencement : résultats/carte Must pour le jour J (26/03/2027) ; le rapport post-course dans la semaine qui suit.

## UX & Interaction Patterns

- Phase de course sur la vitrine : avant → CTA « S'inscrire » dominant ; pendant → « Résultats en direct » avec témoin live (point pulsé, désactivé sous `prefers-reduced-motion`) et CTA discret ; après → résultats + rappel de l'édition suivante.
- La vitrine en direct s'affiche aussi sur le grand écran de la place du village : c'est la vitrine publique en plein écran, pas une surface dédiée.
- Badge dossard : numéro en mono, qualifié par édition — composant unique pour toutes les surfaces live. Pastilles de carte en couleur d'action.
- Squelettes de chargement calqués sur la mise en page finale ; mode sombre : défaut système, override mémorisé, bascule visible en en-tête.
- Registre sobre pour la vitrine (pas de tutoiement, pas de ton promotionnel) : « Classement provisoire — synchronisé il y a 3 min », jamais « Résultats officiels en temps réel ».
- Design tokens « Vert Djurdjura » déjà en place (story 1.1) : réutiliser, ne pas réinventer.

## Cross-Story Dependencies

- **7.1** consomme les Passages arbitrés serveur de l'épopée 4 (sync 4.5) ; les abandons saisis en 5.3 excluent le coureur des calculs ; les annulations auditables (5.4) restent neutres pour le classement.
- **7.2** s'appuie sur la vitrine publique (épopée 2) et nécessite les Passages synchronisés (épopée 4) ; le comptage anonyme des partages alimente le rapport 7.4.
- **7.3** consomme les positions capturées par l'app coureurs opt-in (story 6.2) et le tracé GPX/checkpoints publiés par la vitrine (story 2.4). Sans tracking activé, seuls les passages racontent la course — la carte doit le dire sans inquiéter.
- **7.4** dépend des dossiers validés (épopée 1) pour l'export « commande » à J-10 et inclut les abandons (5.3) ainsi que la portée des partages mesurée en 7.2.
