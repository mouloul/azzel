# PRD Quality Review — Azzel (prd-Azzel-2026-10-19)

## Overall verdict

PRD remarquablement solide pour son calibre (dev solo assisté par IA, événement réel daté) : thèse explicite — « la réputation est le produit » —, décisions tranchées et motivées avec leurs coûts, 24 FRs sur 27 dotées de conséquences testables, contre-mesures de métriques (rare et précieux). Ce qui risque : une question de population (inscription des coureurs sans email/smartphone) renvoyée vers une section Questions ouvertes qui ne la contient pas, et deux zones floues dans le cœur « résultats officiels » — règle de dédoublonnage cross-appareils et seuils de performance de la vitrine. Le point high corrigé, ce PRD peut alimenter UX et architecture sans risque majeur.

## Aptitude à la décision (Decision-readiness) — strong

Les décisions sont énoncées comme des décisions, datées et motivées. Clôture à J-10 « soit le 16/03/2027 » avec son motif opérationnel (« commande médailles et t-shirts sur les chiffres des dossiers validés — pas de stock d'avance », FR-2) et sa traduction produit (export commande, FR-26 ; addendum §2). Session unique « s'applique à tous les rôles » (FR-1). V1 « français, confirmé » (§6.2). Vérification email « gérée en interne » avec transport SMTP et contraintes nommées (addendum §1). Chaque renoncement a un coût assumé, pas lissé : la passerelle de paiement est refusée en V1 au prix de la validation manuelle des preuves CCP (§5, FR-4) ; la forme technique (PWA/natif) est explicitement remise à l'architecture avec ses contraintes (addendum §3) — remise légitime, pas une esquive.

Le cas le plus élégant est le sponsoring : l'option A/B non tranchée devient une propriété du produit — « Le basculement A→B ne nécessite aucun développement » (FR-22). Le report de décision est neutralisé au lieu d'être maquillé en arbitrage. Les trois Questions ouvertes (§8) sont de vraies questions (checkpoints/barrières, classements par sexe et catégories, données de la 1re édition) ; aucune n'est rhétorique.

Seule objection esquivée : les « coureurs sans smartphone ni email » (§2.2) — traitée en Scope honesty ci-dessous, car c'est là que le mécanisme casse.

### Findings

(aucun — le point faible de cette dimension est capturé en Scope honesty)

## Substances vs décorum (Substance over theater) — strong

Aucun théâtre de personas : quatre UJs nommées (Yacine, Karim, Nadia, Malika) qui portent chacune des FRs explicites (« Réalise : FR-8 à FR-14 »), et les rôles secondaires (sponsors, proches, fédération) restent sagement au niveau JTBD sans UJ de remplissage. La Vision est non interchangeable : « Azzel n'est pas un outil de chronométrage : c'est un projet sportif-citoyen outillé dont la réputation est le produit » ne pourrait pas migrer dans un autre PRD de la catégorie. Pas de section NFR boilerplate « scalable/secure/reliable » — les seuils vivent dans les FRs où ils portent (« confirme en < 1 s par coureur », FR-13 ; « reste lisible après 30 jours de cache », FR-7 ; « intervalle de 5–10 minutes », FR-18). FR-20 « Pédagogie batterie » sent la découverte terrain, pas le template.

### Findings

- **[low]** Quatre thèmes affirmés, trois traçables (§1) — « Quatre thèmes structurels guident chaque décision — sport, santé, citoyenneté, écologie » : santé → décharge et alertes hors-délais, citoyenneté → dispositif volontaires, sport → évident ; l'écologie n'a aucune trace dans les FRs (l'e-dossard sans papier n'est jamais revendiqué comme tel). *Fix:* une phrase dans §5 Non-objectifs (« l'écologie n'est pas outillée en V1 au-delà de la dématérialisation du dossard ») ou l'assumer dans la vitrine.

## Cohérence stratégique (Strategic coherence) — strong

Le PRD a une thèse et les fonctionnalités la servent en arc : inscriptions fiables → chrono intègre → vitrine qui « convertit la réussite terrain en crédibilité durable » (§1). FR-27 (socle multi-organisation) pourrait être du scope creep pour une V1 à date dure, mais il est honnêtement limité à une discipline de schéma (« la création d'une seconde organisation ne demande aucun changement de schéma ») au service du pari location post-2027 — coût quasi nul, bien cadré. Les contre-mesures existent et sont intelligentes : SM-C1 (« le self-service ne doit pas exclure les coureurs peu à l'aise avec le numérique ») contrebalance SM-3, SM-C2 protège la batterie contre l'embellissement de la carte. C'est le signe d'une métrique pensée, pas récoltée.

Deux angles morts, l'un de séquencement, l'autre de mesure.

### Findings

- **[medium]** Pas de phasage jalon→FR (§6.1 / §0 / addendum §3) — le §6.1 traite « FR-1 à FR-27 » en bloc, alors que §0 fixe « première version "inscriptions" opérationnelle pour le 15/11/2026 » et l'addendum une répétition générale avant le jour J. Le créateur d'épios/stories devra deviner que FR-1..6 précèdent le 15/11/2026 et quel sous-ensemble doit être sec pour le dry-run — précisément la décision que le PRD devrait porter. *Fix:* une table de 3 lignes (jalon 15/11/2026 → FR-1..6 ; jalon dry-run → FR-7..14, FR-24..25 ; jour J → tout Must) dans §6.1.
- **[medium]** Métriques de thèse non chiffrées et non instrumentées (§7 / FR-26) — la thèse est la réputation, mais la seule métrique qui la touche est SM-5 « cible à chiffrer avec l'organisateur » (et SM-6 pareil) ; SM-4 est un constat binaire (« Résultats live consultables pendant la course »), pas une mesure. Pire, FR-26 exporte la « portée des partages » alors qu'aucune FR n'instrumente les partages (comptage de clics, refs de partage). *Fix:* chiffrer SM-5/SM-6 avec l'organisateur avant le build de FR-16, et ajouter l'instrumentation minimale des liens partagés (paramètre de suivi) comme conséquence de FR-16 — ou retirer « portée des partages » de FR-26.

## Clarté du « done » (Done-ness clarity) — adequate

Le niveau global est élevé : 24 FRs sur 27 ont au moins une conséquence vérifiable, souvent bornée (« Un code expiré ou erroné ne crée pas de compte », FR-1 ; « l'interface confirme en < 1 s par coureur », FR-13 ; « Le tracking désactivé n'enregistre rien », FR-18 ; « Le basculement A→B ne nécessite aucun développement », FR-22). Mais la rubrique demande d'être intraitable ici, et les trois trous tombent dans la zone la plus chargée — l'intégrité des résultats officiels et la surface publique qui porte la thèse.

Le trou le plus sérieux est dans FR-14 : « la sync est idempotente (rejeu sans doublon) et résout les conflits d'horodatage par appareil+checkpoint+coureur » donne la *clé* de dédoublonnage, pas la *règle de gain*. Avec 3 scanneurs par secteur (UJ-2), un coureur scanné au même checkpoint par deux appareils différents produit deux Passages légitimes (clés distinctes) : lequel compte pour le classement ? Aucune conséquence testable ne le dit. De même FR-21 : « La page est légère et lisible sur mobile bas de gamme, réseau faible » est exactement le pattern d'adjectifs que la rubrique demande de signaler — sur la vitrine, surface porteuse de la thèse en zone à réseau faible.

### Findings

- **[medium]** Règle de dédoublonnage cross-appareils manquante (FR-13/FR-14) — la clé « appareil+checkpoint+coureur » rend le rejeu idempotent par appareil, mais ne dédoublonne pas deux appareils distinctes sur le même checkpoint ; rien ne définit quel horodatage gagne pour le classement. C'est le cœur de l'intégrité des résultats. *Fix:* une conséquence explicite dans FR-15 ou FR-14 : « premier horodatage reçu par checkpoint compte ; les Passages postérieurs au même checkpoint sont conservés mais neutres pour le classement ».
- **[medium]** FR-21 sans seuil (§4.6) — « légère et lisible » sans budget mesurable, alors que la page doit servir la vitrine (thèse) sur mobile bas de gamme en réseau faible. *Fix:* borner, même simplement : poids cible de la première page (< 300 ko), premier rendu lisible sur 3G lent (< X s), tracé GPX en chargement différé.
- **[low]** FR-10 sans conséquence testable (§4.3) — seule FR du PRD sans sous-puce : rien sur la visibilité d'une mission sans volontaire affecté, ni sur un volontaire affecté à deux missions chevauchantes. *Fix:* 1–2 conséquences (ex. « une mission affiche toujours son état de couverture : couverte / vacante »).

## Honnêteté du périmètre (Scope honesty) — adequate

Les exclusions font un vrai travail : §6 Non-objectifs est concret et daté (sponsoring hors app, passerelle Satim/CIB/Edahabia « chantier post-2027 », photos « parqués (Could) »), §6.2 ajoute push, hors-ligne de la vitrine, multi-langue. Le Should/Could est assumé sans déscalade silencieuse (« livrées si le temps le permet après le Must », §6.1 ; `[NOTE FOR PM]` sur la timeline d'engagement, FR-23). Densité d'open-items raisonnable pour l'enjeu : 3 questions ouvertes + 7 hypothèses balisées + 1 note — aucun niveau bloquant pour un green-light solo.

Mais le mécanisme de suivi a une faille sur la seule population exclue du PRD.

### Findings

- **[high]** Question fantôme : inscription sur place (§2.2 / §8) — « coureurs sans smartphone ni email `[ASSUMPTION: inscription sur place non traitée en V1 — voir Open Questions]` » : la section Questions ouvertes (§8) ne contient pas cette question. La seule exclusion de population du produit est donc à la fois non confirmée avec l'organisateur et non suivie nulle part ; un lecteur qui balaye §8 pour vérifier les angles morts ne la verra pas. Pour 1 000 coureurs en Kabylie, si cette population existe ne serait-ce qu'à 5 %, c'est un flux papier de secours à organiser hors produit — décision à faire exister. *Fix:* ajouter la question à §8 (« quel volume de coureurs sans email attend-on, et quel fallback manuel (papier, inscription au guichet par un volontaire équipé) ? ») et valider avec l'organisateur avant le 15/11/2026.

## Utilisabilité aval (Downstream usability) — strong

Le PRD est explicitement chain-top (« Destinataires : le développeur (solo, assisté par IA), puis les workflows aval (UX, architecture, épios/stories) », §0), donc la dimension compte pleinement — et elle tient. Glossaire de 14 termes (§3) réellement utilisé dans les FRs (« Passage », « Barrière horaire », « Sync par lots ») ; IDs FR-1..27, UJ-1..4, SM-1..6 + SM-C1/C2 contigus et uniques ; les renvois SM→FR (« Valide FR-7/FR-8 ») et UJ→FR résolvent tous ; chaque UJ porte sa protagoniste nommée avec contexte inline (« Karim, 19 ans, volontaire du village »), pas de UJ flottante. Les sections se lisent isolément : FR-19 est autosuffisante (« chaque coureur n'y apparaît que par son numéro de dossard — aucune information privée (nom, photo, contact) »). Les scories restantes sont en notes mécaniques.

### Findings

(aucun — voir Mechanical notes)

## Justesse de la forme (Shape fit) — strong

La forme correspond au produit : hybride grand public (coureurs, vitrine) + outil d'opérateur unique (Nadia au PC), construit par un dev solo. Quatre UJs à bonne densité — assez pour couvrir les quatre rôles jour J, pas assez pour devenir du décorum ; les personas non portantes (sponsors, médias) restent des lignes JTBD (§2.1). Les contraintes structurantes sont tracées dans les FRs elles-mêmes plutôt que dans une section NFR orpheline (idempotence, annuaire local, horodatage local), ce qui convient à un PRD qui nourrit l'architecture immédiatement. Le calibrage « solo → rigueur légère, substance exigée » de la rubrique est respecté : pas de sur-formalisation committee-grade, aucun sous-formalisage grave.

### Findings

(aucun)

## Mechanical notes

- **Cross-reference cassée** : §2.2 « voir Open Questions » — la question n'existe pas en §8 (cf. finding high en Scope honesty).
- **Index des hypothèses non complet** : 7 balises `[ASSUMPTION]` en ligne (§2.2, 2×§3, §4.5 description, FR-15, FR-19, FR-25) pour 6 entrées en §9 — manque l'hypothèse §4.5 « carte publique pour tous, avec possibilité pour le coureur de désactiver son partage — à confirmer » (celle-ci a une portée vie privée ; elle mérite d'être indexée et résolue).
- **Glossaire** : « Annuaire des coureurs » (FR-12, FR-13, §4.3) n'est pas au §3 alors que c'est un noun de domaine porteur ; « Guichet » (FR-8, §4.2), « PC (course) » (§4.7) et « Directoire » (UJ-3, FR-26) sont utilisés sans définition — mineur.
- **Dérive terminologique légère** : « Sync par lots » (glossaire §3) vs « Synchronisation par lots » (FR-14) ; harmoniser la casse.
- **IDs et renvois** : FR/UJ/SM contigus, uniques, tous les renvois testés résolvent (y compris UJ-4 → FR-18..23, qui couvre tracking + vitrine, cohérent avec le récit de Malika).
- **Sections requises** : présentes au niveau d'enjeu (Vision, UJs, Glossaire, FRs bornées, Non-objectifs, MVP inclus/exclus, SM avec contre-mesures, Questions ouvertes, Index des hypothèses) ; l'absence de section NFR dédiée est compensée par des bornes inline et l'addendum architecture.
