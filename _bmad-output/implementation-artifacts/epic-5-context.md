# Epic 5 Context: Piloter la course au PC

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Donner au PC course (poste de commandement, surface admin du jour J) une vision live et fiable de la course : tableau de bord (retraits, partants par épreuve, en course, arrivés, abandonnés, passages par checkpoint), alertes hors-délais sur barrières horaires, saisie des abandons et annulation auditable des passages erronés. C'est la surface où la sécurité des coureurs et la justesse du chrono se pilotent : chaque chiffre porte sa fraîcheur, aucune donnée figée n'est présentée comme vivante, et le réseau dégradé ne fait pas perdre la situation. Le tableau de bord et les alertes sont attendus pour le dry-run pré-jour J.

## Stories

- Story 5.1: Tableau de bord live du PC course
- Story 5.2: Alertes hors-délais
- Story 5.3: Saisie des abandons
- Story 5.4: Annulation auditable des passages

## Requirements & Constraints

- **Tableau de bord** : retraits, partants par épreuve, en course, arrivés, abandonnés, passages par checkpoint ; la fraîcheur (« synchronisé il y a X min ») est accolée aux chiffres en toutes circonstances, jamais présentée comme instantanée (NFR-5). Réseau dégradé : les chiffres restent affichés avec leur fraîcheur, les alertes déjà émises restent visibles.
- **Alertes hors-délais** : un coureur attendu qui n'a pas franchi un checkpoint avant sa barrière horaire déclenche une alerte avec texte intégral (coureur, checkpoint, barrière) ; actions directes « Appeler le secteur » (contact de la mission) et « Saisir l'abandon ». Barrières horaires configurables par checkpoint — nombre de checkpoints et seuils à confirmer avec l'organisateur (question ouverte). Alerte batterie < 15 % des coureurs opt-in tracking : Should, à confirmer `[ASSUMPTION]`.
- **Abandons** : saisie en trois champs (lieu, motif) + coureur + heure locale ; le coureur sort des calculs de classement en cours mais reste dans les rapports. Saisissable au PC et par les secteurs ; abandons concurrents arbitrés par le serveur (premier reçu gagne).
- **Annulation de passages** : seule voie de correction d'un Passage erroné — auteur, horodatage et motif tracés ; le Passage annulé reste archivé et neutre pour les classements ; aucune surface (PWA, app, admin) ne permet une suppression.
- **Accessibilité** : clignotement borné ≤ 1 flash/s, texte intégral porte l'alerte (jamais la couleur seule), désactivé sous `prefers-reduced-motion` ; contrastes AA+ dans les deux modes avec opérationnelles inversées testées (postes de nuit, départs à l'aube). Ton sobre, pas de tutoiement côté admin ; UI française, code/identifiants en anglais.
- **Isolation multi-organisation** : `organisation_id` + RLS Postgres sur toutes les données accédées.

## Technical Decisions

- **Realtime réservé à cette surface** (AD-7) : le portail admin est la seule surface branchée sur Supabase realtime (plafond free tier : 200 connexions / 2 M msgs/mois) ; les canaux publics passent par le backend Next.js (cache + SSE/polling), jamais en lecture directe. Rafraîchissement sans flash complet de la page.
- **Arbitrage serveur** (AD-3) : premier Passage reçu par checkpoint fait foi, suivants archivés (audit) et neutres ; abandons concurrents — le premier reçu serveur gagne ; heures de départ officielles configurées côté serveur ; le scan au départ est un contrôle de présence, jamais une référence horaire de classement.
- **Annulation auditable** (AD-8) : jamais de suppression ni réécriture silencieuse d'un Passage ; la clé naturelle du Passage (édition, coureur, checkpoint) vit dans `packages/shared`.
- **Abandon = événement de terrain** : un abandon saisi par un secteur suit le canal outbox append-only + lots idempotents (AD-2) ; « l'appareil propose, le serveur dispose ».
- **Module `admin`** dans `apps/web` (monolithe Next.js server-authoritative). Enveloppe d'erreur unique définie dans `shared` ; horodatages ISO 8601 UTC stockés, affichés en heure locale ; journal sync (lots, rejets, offsets horloge) disponible — l'auditabilité du chrono prime.

## UX & Interaction Patterns

- **Tableau de bord live + lignes de board** (UX-DR-12) : agrégats par checkpoint sur cartes, chiffres en display-sm 24 px, indicateur de fraîcheur en pied ; lignes de board triées par heure de passage décroissante, badge dossard mono, heure mono 15 px alignée à droite, séparateurs pointillés (jamais de zébrage), non cliquables en V1 ; mise à jour realtime sans flash complet de la liste.
- **Indicateur de fraîcheur** : « synchronisé il y a X min » en mono 15 px (meta-lg), accolé à toute donnée live.
- **Alerte hors-délais** : bloc danger clignotant période ≥ 1 s, texte intégral (la couleur ne porte jamais seule) ; actions « Appeler le secteur » / « Saisir l'abandon » ; couleur danger jamais détournée (jamais un CTA), attention réservée batterie/avertissements.
- **Design tokens Vert Djurdjura** : opérationnelles jour J (danger, attention) avec paires encre clair/sombre ; mode sombre optionnel, défaut système, override mémorisé, bascule visible en en-tête.
- Squelettes de chargement calqués sur la mise en page finale ; aucune citation kabyle ni décoration en zone critique PC. Maquette 1:1 : `mockups/key-pc-live.html`.

## Cross-Story Dependencies

- **Entrantes** : les données du tableau de bord proviennent des retraits et Passages synchronisés de l'épopée 4 (lots idempotents, arbitrage serveur) ; le contact « Appeler le secteur » vient des missions/secteurs de l'épopée 3 ; le socle iam + RLS (épopée 1) porte l'accès admin et l'isolation des données.
- **Internes** : 5.2 expose l'action « Saisir l'abandon » → 5.3 ; 5.1 affiche les passages par checkpoint que 5.4 annule de façon auditable.
- **Sortantes** : les abandons (5.3) et annulations (5.4) conditionnent les classements et rapports de l'épopée 7 — le coureur abandonné sort des calculs en cours mais figure dans le rapport post-course ; les Passages annulés sont neutres pour les classements.
- **Jalon** : 5.1 et 5.2 attendus pour le dry-run pré-jour J (cœur offline + PC course) ; le jour J, la vitrine « en direct » (épopée 7) s'appuie sur les mêmes Passages arbitrés.
