# Azzel — Fonctionnalités par story

Document de lecture, sans jargon technique. Pour chaque story : ce que la fonctionnalité fait, et comment ça se déroule concrètement pour la personne concernée.
Source : `epics.md` (56 stories, 11 épopées). État : sprint-status au 2026-11-03.

**Légende des états** : `done` = terminée · `review` = codée, en attente de revue et de recette humaine · `backlog` = pas commencée.

**Les personnes** : le *coureur*, l'*organisateur* (comité, admin), *Nadia* (organisatrice au PC course), le *volontaire* (villageois bénévole), le *visiteur* (sans compte), le *proche* (suit un coureur à distance).

---

## Épopée 1 — S'inscrire et boucler son dossier

### 1.1 Fondation du monorepo — `review`
**Fonction technique, invisible pour l'utilisateur.** Un seul dépôt contient le site (Next.js), l'app coureurs (Expo) et le code partagé. Les couleurs, polices et espacements de la charte sont définis une seule fois et réutilisés partout. Le thème clair/sombre suit le réglage du téléphone, et le choix manuel est mémorisé. Les messages d'erreur ont un format unique. Les heures sont stockées en UTC et affichées en heure locale.

### 1.2 Accès coureur par email + code, session unique — `review`
1. Le coureur saisit son email.
2. Il reçoit un code à usage court par email.
3. Il saisit le code (champ unique, collage autorisé, durée de validité affichée, renvoi possible après un compte à rebours).
4. Code bon : le compte est créé et il est connecté. Code faux ou expiré : aucun compte n'est créé et un message dit quoi faire.
5. Pas de mot de passe. Chaque nouvelle connexion déconnecte les sessions précédentes du même compte, quel que soit le rôle : personne ne reste connecté à votre place sur un autre appareil.

### 1.3 Formulaire d'inscription à l'édition — `review`
1. Le coureur connecté choisit son épreuve (longue ou moyenne).
2. Il renseigne identité, contact, personne à prévenir en urgence et taille de t-shirt.
3. Les champs obligatoires bloquent un envoi incomplet. La catégorie d'âge est calculée automatiquement.
4. Après la date de clôture (J-10, 16/03/2027, réglable côté serveur), l'envoi est refusé avec un message explicite.

### 1.4 Acceptation décharge et règlement intérieur — `review`
1. Après le formulaire, le coureur lit puis accepte la décharge de bonne santé et le règlement intérieur.
2. Chaque acceptation est enregistrée avec la date, l'heure et la version du document.
3. Sans les deux acceptations, impossible de continuer.

### 1.5 Télversement de la preuve de paiement CCP — `review`
1. Le coureur choisit une photo ou un PDF de son virement CCP depuis son téléphone.
2. L'image est compressée sur le téléphone (≤ 300 Ko) avec un retour visible. Un autre format est refusé avant l'envoi, avec la liste des formats acceptés.
3. Si le réseau coupe, l'envoi se reprend sans re-sélectionner le fichier. Le brouillon est gardé sur le téléphone et un bouton « Appeler l'équipe » accompagne l'erreur.

### 1.6 Validation ou refus du dossier par l'organisateur — `review`
1. L'organisateur ouvre un dossier dont la preuve est déposée.
2. Il valide, ou il refuse en saisissant un motif obligatoire (court, libre).
3. Un refus n'est jamais silencieux : le motif part au coureur par email, avec le numéro de l'équipe.

### 1.7 Checklist de dossier self-service — `review`
1. Le coureur ouvre son espace et voit la liste : email vérifié, épreuve, décharge, règlement, preuve, validation.
2. Chaque pièce manquante porte un lien direct vers l'action à faire. Un compteur indique l'avancement.
3. Quand tout est vert, le bandeau « Dossier validé — dossard prêt » apparaît.
4. Le bouton « Appeler l'équipe » reste visible en permanence (pour les coureurs peu à l'aise avec le numérique).

### 1.8 Notifications de statut par email — `review`
1. À chaque changement (reçu, validé, refusé avec motif), un email part au coureur.
2. Les envois passent par une file avec reprise : une panne du serveur d'email ne bloque rien.
3. Les textes sont sobres et disent quoi faire.

### 1.9 Socle multi-organisation (schéma + RLS) — `review`
**Fonction technique.** Chaque donnée est rattachée à une organisation, et la base empêche une organisation de lire celle d'une autre. Objectif : pouvoir louer la plateforme à d'autres organisateurs après 2027 sans changer la structure de la base. Un test crée une seconde organisation et vérifie l'absence de fuite.

---

## Épopée 2 — Vitrine publique de l'édition

### 2.1 Page d'annonce publique minimale — `review`
1. Un visiteur ouvre l'URL, même en 3G lente. La page pèse moins de 300 Ko et devient lisible en moins de 5 s.
2. Il voit dates, épreuves, lieu, et la mention « Sous l'égide de la Fédération et du ministère des Sports ».
3. Le bouton « S'inscrire » mène au parcours d'inscription. « Appeler l'équipe » est visible.
4. Pendant le chargement, des squelettes reprennent la mise en page finale.

### 2.2 Identité Village — piliers, frises, sombre — `review`
1. Quatre piliers (sport, santé, citoyenneté, écologie) portent chacun un petit glyphe monochrome.
2. Une frise kabyle décorative marque le haut et le bas de page, jamais derrière du texte.
3. Mode sombre : réglage du système par défaut, bouton de bascule visible en en-tête, choix mémorisé.
4. Aucun symbole politique ou sacré détourné.

### 2.3 Bloc sponsors option A / option B — `review`
1. L'organisateur choisit dans l'admin : option A (un sponsor unique, à l'emplacement signature) ou option B (plusieurs sponsors, emplacements équivalents).
2. La vitrine reflète le choix immédiatement. Passer de A à B ne demande aucun développeur.

### 2.4 Parcours GPX, consignes et page région — `review`
1. Le visiteur consulte la page course : dates, épreuves (longue ~35 km, moyenne 10–15 km), dénivelés, horaires, ravitaillements, consignes de sécurité, sans compte.
2. Le tracé GPX se charge après le contenu, jamais dans le chemin critique.
3. La page région donne la consigne de sécurité « ne pas défier la montagne » et la note sur les singes sacrés du Jurjura.
4. L'admin édite hébergement, restauration, région et événements annexes sans développeur.

### 2.5 Vidéo trailer et témoignages (Should) — `review`
1. Un trailer de la 1ʳᵉ édition s'affiche en vignette légère. Il ne se charge qu'au clic, sans lecture automatique.
2. Des témoignages courts de coureurs s'affichent sans défilement automatique.
3. Sans matière de 1ʳᵉ édition, les deux blocs se désactivent proprement.

---

## Épopée 3 — Armer les volontaires

### 3.1 Import Excel des volontaires et invitations — `done`
1. L'admin dépose un fichier Excel (nom, email, téléphone).
2. Les lignes valides créent des volontaires. Les lignes invalides sont rejetées avec un rapport ligne par ligne, sans import silencieux.
3. Chaque volontaire reçoit une invitation par email vers la connexion email + code (comme les coureurs, sans mot de passe).
4. Sa première connexion le passe « activé » dans la liste admin.

### 3.2 Secteurs et missions typées — `done`
1. L'admin découpe l'édition en secteurs.
2. Il y crée des missions typées : scan checkpoint, accueil, sécurité tronçon, sécurité arrivée, distribution dossards, communication.
3. Chaque mission affiche « couverte » ou « vacante ».
4. Une affectation qui crée un chevauchement d'horaires pour un volontaire donne un avertissement non bloquant.

### 3.3 Fiche mission hors-ligne (PWA volontaires) — `done`
1. Le volontaire ouvre la PWA (installable, iOS Safari inclus).
2. Sa fiche (secteur, rôle, horaires, contacts, consignes) est préchargée à l'affectation. Elle se consulte sans réseau, application fermée.
3. Les contacts du PC sont cliquables pour appeler. Lisible sur un Android d'entrée de gamme.
4. Le scan QR n'est qu'une mission parmi d'autres.

### 3.4 Préchargement de l'annuaire des coureurs — `review`
1. Avant le départ, le téléphone du scanneur copie l'annuaire des coureurs (dossards, identité).
2. L'écran affiche « annuaire prêt — N coureurs » (annoncé aux lecteurs d'écran).
3. Un coureur absent de l'annuaire sera signalé « DOSSARD INCONNU » au scan.

---

## Épopée 4 — Chronométrage offline et e-dossard

### 4.1 E-dossard QR hors-ligne — `review`
1. Dès que le dossier est validé, le coureur ouvre son e-dossard : un grand QR code.
2. Le QR encode un jeton unique de l'édition, jamais le dossard nu. Il reste lisible 30 jours sans réseau.
3. Un badge « HORS-LIGNE PRÊT » est affiché. Un raccourci système est recommandé pour l'ouvrir d'un geste, écran verrouillé.

### 4.2 Moteur de scan caméra et états de retour — `review`
1. Le volontaire tape « Démarrer le scan » (ce premier geste débloque le son).
2. Caméra plein écran. Chaque scan répond en moins d'une seconde par un bip (mélodie distincte succès / doublon / inconnu), une vibration et un texte complet.
3. Caméra refusée ou indisponible : écran dédié « Autoriser la caméra » avec le chemin dans les Réglages et un bouton pour appeler le PC.
4. Fonctionne aussi sur iOS Safari (lecteur de repli).

### 4.3 Scan de retrait du dossard — `review`
1. Au guichet, le volontaire scanne l'e-dossard : le coureur est marqué « présent au départ » (~700 retraits le jour J, hors-ligne).
2. Second scan du même coureur : « ↻ DÉJÀ PASSÉ » avec l'heure du premier retrait. Rien n'est dupliqué.

### 4.4 Scan de passage aux checkpoints — `review`
1. Un coureur franchit le checkpoint. Le volontaire scanne.
2. Succès : « ✓ Passage enregistré — dossard 217 · 10:42:07 » en moins d'une seconde, sans réseau.
3. Doublon : « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS », sans duplication.
4. Inconnu : « ⚠ DOSSARD INCONNU — revérifier » avec un bouton « Appeler le PC ».
5. Le voyant est grand (≥ 96 px, texte ≥ 24 px), et ne clignote pas plus d'une fois par seconde.

### 4.5 Synchronisation par lots idempotente — `review`
1. Les scans sont gardés dans une boîte d'envoi locale.
2. Dès que le réseau revient, ils partent par lots. Un renvoi ne crée jamais de doublon.
3. Un bandeau reste visible : « ◷ N passages en attente » puis « ✓ envoyés — file : 0 ». Un journal de synchro est consultable en lecture seule.
4. Le serveur arbitre : le premier passage reçu par checkpoint fait foi pour le classement, les suivants sont archivés. L'appareil ne supprime rien et ne fixe aucun temps définitif.
5. La boîte d'envoi survit à une session révoquée.

---

## Épopée 5 — Piloter la course au PC

### 5.1 Tableau de bord live du PC course — `review`
1. Nadia ouvre le tableau de bord : retraits, partants par épreuve, en course, arrivés, abandonnés, passages par checkpoint.
2. La mise à jour est en direct, sans recharger toute la page.
3. La fraîcheur (« synchronisé il y a X min ») est toujours affichée à côté des chiffres, même réseau dégradé.
4. Les lignes sont triées par heure de passage décroissante (dossard et heure en police monospace).

### 5.2 Alertes hors-délais — `review`
1. Pour chaque checkpoint, une barrière horaire est configurée.
2. Si un coureur attendu n'est pas passé avant la barrière, un bloc danger clignotant (période ≥ 1 s) donne coureur, checkpoint et barrière.
3. Deux actions directes : « Appeler le secteur » et « Saisir l'abandon ».
4. Avec « réduire les animations », le texte seul porte l'alerte.
5. L'alerte batterie < 15 % des coureurs opt-in est une hypothèse à confirmer (Should).

### 5.3 Saisie des abandons — `review`
1. L'organisatrice ou un volontaire de secteur saisit coureur, lieu, motif et heure locale.
2. Le coureur sort des classements en cours mais reste dans les rapports.
3. Si deux saisies concurrentes arrivent (PC et secteur), la première reçue par le serveur gagne.

### 5.4 Annulation auditable des passages — `review`
1. Nadia repère un passage erroné (mauvais scan, mauvais coureur) et l'annule depuis l'admin.
2. L'annulation trace l'auteur, l'heure et le motif. Le passage reste archivé mais neutre pour les classements.
3. Aucun écran ne permet de supprimer un passage : seule l'annulation tracée existe.

---

## Épopée 6 — App coureurs et suivi GPS

### 6.1 Installation et onboarding de l'app native — `review`
1. Le coureur installe l'app (Play Store / App Store ; repli Android : APK documenté).
2. Il se connecte avec le même email + code (session unique).
3. Il retrouve son dossier et son e-dossard. Dossier déjà vert : accès direct à l'e-dossard.

### 6.2 Activation du suivi GPS opt-in — `review`
1. Le coureur active explicitement le suivi.
2. Position relevée toutes les 5 à 10 minutes en précision équilibrée, stockée hors-ligne, envoyée en lot au retour du réseau.
3. Suivi désactivé : rien n'est enregistré, au sens littéral.
4. La fréquence n'est jamais augmentée au détriment de la batterie.

### 6.3 Guide permission iOS « Autoriser une fois » — `review`
1. Sur iPhone, si la permission « Autoriser une fois » a expiré, l'app le détecte à la réouverture.
2. Elle affiche le chemin « Réglages > Azzel > Localisation > Toujours » et un bouton « Ouvrir les Réglages ».
3. Permission refusée : suivi inactif sans culpabilisation, guide toujours accessible.
4. Permission rétablie : le suivi repart seul.

### 6.4 Pédagogie batterie et rappel J-7 — `review`
1. À l'activation du suivi ou depuis la rubrique batterie, le coureur voit les conseils : partir à 100 %, ne pas tuer l'app, prendre une powerbank (vendue au village), avec la citation « Un point après l'autre, et l'ouvrage est parfait ».
2. À J-7, un email de rappel avec bouton vers l'app.
3. L'alerte batterie < 15 % côté coureur est une hypothèse à confirmer.

---

## Épopée 7 — La course visible de l'extérieur

### 7.1 Classements par épreuve et départs échelonnés — `review`
1. Chaque épreuve a son classement ; un coureur n'apparaît que dans celui de son épreuve.
2. Les départs échelonnés sont gérés à partir des heures officielles configurées côté serveur.
3. Classement scratch ; par sexe et catégorie d'âge à confirmer.
4. Un rafraîchissement n'expose jamais de classement partiel incohérent. Le scan de retrait ne sert pas de temps de départ.

### 7.2 Résultats en direct partageables — `review`
1. Un proche ouvre la page de résultats ; classements et passages se mettent à jour en direct (SSE ou polling via le serveur, sans accès direct à la base).
2. Le lien est partageable ; un paramètre de suivi anonyme est compté côté serveur (aucune donnée personnelle).
3. « Classement provisoire » et la fraîcheur sont affichés. Avant le départ : « Pas encore de partants — départ à HH:MM ».

### 7.3 Carte publique anonyme — `review`
1. Un proche ouvre la carte : tracé officiel, checkpoints, dernière position connue des coureurs opt-in.
2. Chaque coureur n'est identifié que par son numéro de dossard (jamais nom, contact ni photo).
3. Positions de plus d'une heure estompées ; la dernière position connue est présentée comme telle.
4. La carte ne charge jamais dans le chemin critique 3G.

### 7.4 Rapports post-course et export « commande » — `review`
1. L'admin exporte un fichier unique de bilan de l'édition : inscrits, présents, passages, arrivées, abandons, portée des partages.
2. À J-10, un export « commande » donne les décomptes validés par épreuve et par taille de t-shirt (médailles, t-shirts, zéro stock).

---

## Épopée 8 — Environnement de recette hébergé

Épopée technique : mettre l'application en ligne, avec des données fictives, pour que le comité la prenne en main avant le jour J. Règle cardinale : aucune donnée réelle de coureur n'y arrive.

### 8.1 Fabrique de connexion unique et base hébergée — `review`
Une seule connexion à la base pour tous les modules (au lieu de dix), compatible avec un pooler, et une base hébergée. Un test prouve qu'une organisation ne voit pas les données d'une autre sur la base hébergée.

### 8.2 Stockage des preuves de paiement hors disque local — `review`
Les preuves téléversées sont stockées dans un stockage objet. Après un redémarrage du serveur, elles restent lisibles dans l'écran de validation. En local, le disque reste le comportement par défaut.

### 8.3 Jeu de données fictif « édition complète » — `review`
1. Un script peuple l'environnement : une édition, plusieurs épreuves, une cinquantaine de coureurs à tous les stades du dossier, preuves, secteurs, missions, volontaires, dossards et quelques passages.
2. Tout est manifestement inventé, sans email réel hors équipe.
3. Le script est rejouable sans doublon, et une commande remet l'environnement à l'état initial.

### 8.4 Mise en ligne de la recette et remise au comité — `review`
1. L'application est servie en HTTPS sur une URL stable du domaine du projet.
2. Les membres du comité se connectent avec leur email (code à six chiffres) et arrivent organisateurs.
3. Les emails (SPF/DKIM posés) arrivent en moins d'une minute, vérifiés sur chaque adresse du comité. Ils portent la mention « démonstration, données fictives ».

---

## Épopée 9 — Refonte de la vitrine publique

### 9.1 Socle de style partagé — `review`
Les couleurs en dur des écrans toujours sombres (scan, e-dossard, textes vitrine) passent par les variables de la charte. Un jeu de classes communes (action, chip, carte, en-tête, pastille d'état, tableau, champ) remplace les valeurs dupliquées. Un test interdit tout nouveau code couleur écrit à la main. Les rayons de coins sont unifiés (pilule pour actions et chips, 14–20 px pour les cartes). Aucun changement visible : seule la provenance des valeurs change.

### 9.2 Accueil refondu — `review`
1. Le premier écran est un hero sombre : dégradé forêt, silhouette de crête en SVG, grand titre avec le nom de l'événement en ocre, date, et un rail de chiffres clés (épreuves, D+ max, altitude, places).
2. Les chiffres de l'édition précédente tiennent sur une bande horizontale.
3. Piliers, appel aux bénévoles et partenaires reprennent le même vocabulaire de formes.
4. Mention d'égide, frises et glyphes conservés ; bascule sponsors A/B conservée.
5. Sur téléphone : titre qui s'adapte, rail sous le titre, cibles ≥ 44 px.

### 9.3 Coquille de la section parcours — `review`
1. Sur l'accueil, un sélecteur d'épreuve pilote toute la section : synthèse chiffrée (distance, D+, D−, altitude, heure de départ, barrière horaire) et liste des points de passage avec leurs services en toutes lettres.
2. Basculer d'épreuve ne laisse jamais un kilométrage sans son épreuve.
3. La carte 3D et le profil ne sont pas encore là : la section est complète en texte, avec un emplacement annoncé pour la visualisation à venir.
4. Aucun JavaScript ajouté au chemin critique. La section ne prend jamais le premier écran.

### 9.4 Inscription et checklist refondues — `review`
1. Un fil d'étapes montre l'étape courante par la forme et par le texte, pas seulement par la couleur.
2. Chaque champ a une étiquette, les champs obligatoires sont annoncés en texte, les erreurs suivent le format commun avec le bouton d'assistance.
3. Dépôt de preuve et checklist gardent leur comportement (compression, formats refusés, brouillon, compteur, bandeau « dossier validé »).
4. Sur téléphone : une colonne, récapitulatif sous le formulaire.

### 9.5 Résultats refondus — `review`
1. Recherche par numéro de dossard (pas de recherche par nom : les canaux publics n'exposent jamais un nom), filtre d'épreuve et de catégorie visibles sans défilement sur mobile.
2. Tableau lisible en écran étroit, avec défilement horizontal propre et chiffres alignés.
3. « Classement provisoire », fraîcheur et état vide avant départ restent affichés. Le suivi anonyme des partages continue d'être compté.

### 9.6 Non-régression de la vitrine refondue — `review`
Mesures écran par écran : poids, temps de premier rendu, accessibilité (focus visible, cibles ≥ 44 px, contrastes AA, zoom 200 %, animations réduites). Les recettes de l'épopée 2 sont réalignées sur les écrans refondus. Voir `deferred-work.md` pour les écarts constatés et non corrigés.

---

## Épopée 10 — Refonte des surfaces d'exploitation

### 10.1 PWA volontaires refondue — `backlog`
1. La mission en cours domine l'écran ; l'état de synchro reste visible en permanence sans masquer l'action.
2. Écran de scan : voyant en pastille ≥ 96 px, texte ≥ 24 px graisse 800, heure en monospace ≥ 16 px ; trois états distincts par la forme et le texte (succès, déjà passé, dossard inconnu avec appel direct au PC).
3. Clignotement ≤ 1 par seconde, annonce `aria-live`, viseur plein cadre.
4. Comportement hors-ligne strictement inchangé.

### 10.2 App coureurs refondue — `backlog`
1. Thème de l'app lu depuis les tokens partagés, mode sombre par défaut.
2. E-dossard : numéro à 74 px, « HORS-LIGNE PRÊT » en monospace, QR sur carte blanche.
3. Écran de suivi : progression, position sur le tracé, journal de synchro ; état du suivi (activé / désactivé / en pause) toujours lisible en haut.
4. Actions destructrices (abandon, arrêt du suivi) distinctes par la forme. Cibles ≥ 44 dp, pause/arrêt du scan ≥ 64 dp.
5. Le cache de l'e-dossard et la génération du QR ne sont pas touchés.

### 10.3 Back-office refondu — `backlog`
1. Les six feuilles admin convergent sur le socle. Densité obtenue par l'espacement.
2. Tous les tableaux partagent un gabarit : en-têtes associés, badges de statut, dossards et heures en monospace, défilement horizontal en écran étroit.
3. Compteurs de tête de page lisibles sans survol, cliquables vers le filtre.
4. Tableau de bord live sans clignotement complet ; alerte hors-délais inchangée.

### 10.4 Non-régression des surfaces d'exploitation — `backlog`
Preuve de bout en bout hors-ligne : retrait, scan, file d'attente, reprise réseau, synchro par lots. Confirmation de scan < 1 s sur iOS Safari. Aucun style manquant hors-ligne. Audit d'accessibilité complet. Recettes des épopées 3, 4 et 5 réalignées.

---

## Épopée 11 — Le parcours en 3D

### 11.1 Pipeline GPX vers parcours.json — `backlog`
1. L'organisateur dépose un export GPX dans `docs/GPX/`.
2. Le pipeline produit `parcours.json` : géométrie, vues par épreuve, profil altimétrique, points de passage, D+ et D−. L'altitude vient du GPX.
3. Une porte de qualité refuse ou signale un relevé trop pauvre en nommant le défaut. Elle refuse `activity_24827718657.gpx` et accepte `activity_24920331005.gpx`.
4. Deux épreuves partagent une géométrie ; chaque point de passage a un kilométrage propre à chaque épreuve.
5. Toute évolution du tracé produit une nouvelle version explicite.

### 11.2 Fond cartographique de production et attributions — `backlog`
**Décision à prendre avant tout le reste de l'épopée.** Arbitrer le fond de carte (ArcGIS avec clé, fournisseur payant, ou OpenTopoMap seul) à cause de la licence : Azzel vend des inscriptions et affiche des sponsors. Un bloc d'attributions reste visible en permanence sur toute carte.

### 11.3 Carte 3D du parcours — `backlog`
1. Carte MapLibre à relief, tracé de l'épreuve active, bascule satellite/topo, contrôle d'inclinaison.
2. Points de passage en pastilles numérotées ; au tap ou au clavier, une fiche donne nom, km, altitude, D+ amont et services.
3. Barre de chips (3D, survol, exagération du relief, fond), cibles ≥ 44 px.
4. Chargement différé. Sans WebGL ou sans tuiles : le bloc texte reste, avec un message explicatif.

### 11.4 Profil altimétrique et graphe de technicité — `backlog`
1. Profil SVG lisible d'abord sur téléphone, points de passage repérés.
2. Aire colorée par pente : < 5 % roulant, 5–12 % soutenu, 12–20 % raide, > 20 % très raide. Légende en trait et en toutes lettres ; teintes différentes aussi en clarté.
3. Lecture au survol comme au tap ; kilomètre, altitude et pente annoncés en texte.

### 11.5 Curseur partagé et bascule d'épreuve — `backlog`
1. Toucher le profil déplace un repère sur la carte, et réciproquement.
2. Basculer d'épreuve fait suivre carte, profil, synthèse et points de passage ensemble ; l'épreuve active reste visible à côté du kilométrage.

### 11.6 Confort de lecture du parcours (Should) — `backlog`
1. Survol animé de la caméra le long du tracé, démarrage et arrêt explicites, jamais automatique, neutralisé par « réduire les animations ».
2. Exagération du relief réglable entre 1,5 et 2 ; la bascule 3D donne une carte 2D complète.
3. Bandeau du profil repliable, état mémorisé.
4. Cette story peut être coupée sans toucher aux précédentes.

### 11.7 Barrières horaires sur le parcours — `backlog`
1. Une heure limite par point de passage et par épreuve, visible sur le profil et dans la fiche du point.
2. Le modèle (rattaché au checkpoint de l'épopée 4, ou entité propre) est tranché dans la story, avec évaluation d'impact sur les écrans de scan avant toute migration.

---

## Synthèse

| Épopée | Stories | `done` | `review` | `backlog` |
| --- | --- | --- | --- | --- |
| 1 Inscription | 9 | 0 | 9 | 0 |
| 2 Vitrine | 5 | 0 | 5 | 0 |
| 3 Volontaires | 4 | 3 | 1 | 0 |
| 4 Chrono offline | 5 | 0 | 5 | 0 |
| 5 PC course | 4 | 0 | 4 | 0 |
| 6 App coureurs | 4 | 0 | 4 | 0 |
| 7 Extérieur | 4 | 0 | 4 | 0 |
| 8 Recette hébergée | 4 | 0 | 4 | 0 |
| 9 Refonte vitrine | 6 | 0 | 6 | 0 |
| 10 Refonte exploitation | 4 | 0 | 0 | 4 |
| 11 Parcours 3D | 7 | 0 | 0 | 7 |
| **Total** | **56** | **3** | **42** | **11** |
