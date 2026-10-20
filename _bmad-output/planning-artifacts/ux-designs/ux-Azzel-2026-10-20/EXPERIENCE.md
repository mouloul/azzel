---
name: Azzel
status: final
created: 2026-10-20
updated: 2026-10-20
sources:
  - ../../briefs/brief-Azzel-2026-10-19/brief.md
  - ../../briefs/brief-Azzel-2026-10-19/addendum.md
  - ../../prds/prd-Azzel-2026-10-19/prd.md
  - ../../prds/prd-Azzel-2026-10-19/addendum.md
  - ../../architecture/architecture-Azzel-2026-10-19/ARCHITECTURE-SPINE.md
---

# Azzel — Experience Spine

> Trail d'Ait-Aissi, 2ᵉ édition — 26 mars 2027, Yakouren, Kabylie. ≥ 1 000 coureurs, 150–200 volontaires, zones blanches sans réseau. Événementiel critique : grand public + jour J sans filet, la réputation en jeu.

## Foundation

Plateforme double à frontières strictes :

- **Web (Next.js)** — vitrine publique (sans compte), inscriptions / espace coureur web, portail volontaires en **PWA offline** (scan QR), portail admin / PC course.
- **App native coureurs (Expo)** — tracking GPS en arrière-plan (impossible en PWA : « iOS jamais, Android écran éteint »), e-dossard, dossier. Distribution Play Store + App Store (soumission anticipée), repli Android : APK sideload.

Terminaux : navigateurs publics (vitrine), mobiles scanneurs des volontaires (PWA, iOS Safari inclus — fallback `@zxing/browser` toujours actif), smartphones coureurs hétérogènes Android/iOS, PC de course (admin, temps réel réservé à cette surface). **Aucun système UI nommé** (pas de shadcn/MUI) : `DESIGN.md` est la référence d'identité visuelle ; cette spine est l'expérience. UI en français ; code et identifiants en anglais. Mode sombre : défaut = préférence système, override mémorisé ; toggle visible dans l'en-tête de chaque surface ; PWA volontaires : mode sombre proposé à la première ouverture (checklist de préparation la veille — départs à l'aube).

**Les spines gagnent sur tout mockup, wireframe ou import en cas de conflit** — y compris les maquettes `.working/direction-*.html`, les maquettes clés `mockups/key-*.html` et les wireflows `wireframes/flow-*.excalidraw` (ex. : le wireflow app coureur mentionnait « certificat médical / pièce d'identité » ; la PRD fait foi — décharge, règlement intérieur, preuve CCP).

Extraits de travail des sources : `.working/source-extract-*.md` (brief, PRD, architecture) — notes de lecture non normatives.

## Information Architecture

→ Composition complète : `wireframes/ia-2026-10-20.excalidraw` (diagramme source ; la table ci-dessous le reprend).
→ Maquette 1:1 de la vitrine (surface 1) — phase avant-course + bloc « Résultats en direct » pendant-course : `mockups/key-vitrine.html`.

| Surface | Accès | Contenu |
|---|---|---|
| **1 · Vitrine publique** — sans compte | URL publique, liens partagés | Page course (dates, Longue ~35 km / Moyenne 10–15 km, parcours GPX, égide Fédération + ministère, piliers à **glyphes amazighs discrets**) · carte live publique (dossards anonymes, positions > 1 h estompées) · résultats en direct (URLs partageables, fraîcheur affichée) · infos pratiques + contact « Appeler l'équipe » en bouton (SM-C1) · page région (contenu éditorial : consigne sécurité « ne pas défier la montagne » — sagesse de la vieille de janvier ; patrimoine singes sacrés du Jurjura « les tuer serait peu honorable ») · bloc sponsors (option A signature / option B multiples) · **vidéo trailer 1ʳᵉ édition** (Should — lecture à la demande) · **témoignages coureurs** (Should) · **galerie photos par édition** (Could — chargement différé) · **historique des éditions** (Could — via socle multi-organisation) |
| **2 · Espace coureur web** | Email + code (session unique) | Inscription (formulaire épreuve, t-shirt) · décharge + règlement horodatés · télversement preuve CCP (compression ≤ 300 Ko) · checklist dossier self-service · e-dossard QR · notifications de statut par email |
| **3 · App native coureurs** (Expo · stores · repli APK) | Stores / APK | E-dossard QR hors-ligne (cache 30 jours) · activation tracking opt-in (fenêtre 5–10 min) · permission localisation (piège iOS « Autoriser une seule fois ») · pédagogie batterie · outbox sync |
| **4 · PWA volontaires** (invitation Excel → mot de passe) | Invitation | Missions par secteur (couverture / vacante) · fiche mission hors-ligne · caméra scan plein écran (< 1 s, bip, feu vert / rouge) · annuaire coureurs préchargé (IndexedDB) · outbox sync (« 217 passages en attente → envoyés ») |
| **5 · Portail admin / PC course** (temps réel réservé admin) | Compte organisateur | Tableau de bord live (retraits, partants, en course, arrivés, fraîcheur = dernière sync) · alertes hors-délais clignotantes · abandons (lieu, motif, heure) · secteurs & missions (import Excel volontaires) · annulation auditable de passages · validation / refus de dossiers avec motif · rapports post-course (export « commande » à J-10) |

**Transverses sync** (canon → Offline & Synchronisation) : outbox append-only · lots idempotents · session unique par compte + jeton d'appareil · enveloppe d'erreur unique · horodatage UTC → affichage local · anonymat public (dossard qualifié par édition) · isolation des données par organisation (schéma `organisation → événement → édition`, FR-27) · UI français.

Vitrine et espace coureur web n'ont **pas de mode hors-ligne** (exclu du MVP) ; l'offline est le cœur des surfaces 3 et 4.

## Voice and Tone

Microcopy en français. Sérieux, crédible, chaleureux — jamais marketing creux. La marque et la posture visuelle vivent dans `DESIGN.md` → Brand & Style.

| Dire | Ne pas dire |
|---|---|
| « Dossier validé — dossard prêt » | « Félicitations ! 🎉 Votre inscription est un succès ! » |
| « Dépose ta preuve de paiement CCP » (chaque pièce manquante nomme l'action à faire) | « Documents manquants (3) » |
| « 217 passages en attente → envoyés » | « Synchronisation terminée avec succès ✓ » |
| « HORS-LIGNE PRÊT — ton dossard marche sans réseau » | « Connexion perdue » |
| « Un souci ? Appelle l'équipe : +213 … » (SM-C1, toujours visible) | Rediriger vers une FAQ, noyer le contact |
| « Classement provisoire — synchronisé il y a 3 min » | « Résultats officiels en temps réel » |
| Tutoiement chaleureux côté coureur et volontaire | Ton promotionnel, urgence artificielle, points d'exclamation |

Registres : tutoiement pour le coureur et le volontaire (c'est une course de village) ; neutre et sobre pour la vitrine publique et l'admin. Les chiffres et les verbes priment sur les adjectifs.

**Microcopy amazighe** — proverbes kabyles anciens (domaine public, source Hanoteau 1867 toujours notée), une seule citation par emplacement, jamais en zone critique (scan, alertes, PC) :

- « Un point après l'autre, et l'ouvrage est parfait » → pédagogie batterie (UJ-1, étape 9).
- « Il franchit les cols et bannit la crainte de son cœur » → écrans de départ et de fin de course.
- « Aman d laman — l'eau, c'est la confiance » → ravitaillements et page région.

Interdits : le mot « Tafsut » comme label, tout symbole ou mot à charge politique ou sacrée, toute signification inventée, tout proverbe sous copyright (paraphrase interdite aussi — on cite le domaine public ou rien).

## Component Patterns

Comportementaux. Les specs visuelles vivent dans `DESIGN.md` → Components (mêmes noms).

| Composant | Surface | Règles comportementales |
|---|---|---|
| Caméra scan plein écran | PWA volontaires | Viser le dossard → confirmation < 1 s (qualifiée sur le fallback iOS Safari). Le bip + voyant EST la confirmation : aucun bouton « valider » intermédiaire. Fonctionne à 0 réseau via annuaire coureurs préchargé (IndexedDB). Audio débloqué au tap « Démarrer le scan » (premier geste) ; vibration (haptique) en troisième canal ; bip distinct doublon vs inconnu (deux mélodies). Le voile haut affiche la mission en cours (« CP2 · Djurdjura-ouest ») à côté du badge · LIVE et de l'heure locale ; le dernier scan traité reste visible en pastille au-dessus du voyant. |
| Voyant scan | Caméra scan | `role="status"` / `aria-live="assertive"` ; annonces distinctes succès / doublon (avec l'heure du premier passage) / inconnu ; état « caméra active · annuaire chargé » annoncé au démarrage du scanner. Succès `{colors.succes}` : « ✓ Passage enregistré » + heure. Danger `{colors.danger}` : « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS » (le premier passage reste) ou « ⚠ DOSSARD INCONNU — revérifier » + bouton appel direct au PC. Doublon et inconnu différenciés par icône (↻ / ⚠) et position, sémantique danger inchangée. Aucune suppression locale, jamais. |
| Fiche mission hors-ligne | PWA volontaires | Secteur, rôle, horaires, contact PC, consignes. Consultable application fermée, réseau absent. Le scan n'est qu'une mission parmi d'autres. |
| Checklist dossier | Espace coureur, app | Chaque pièce manquante nomme l'action à faire (lien direct) ; compteur de pièces en tête (« 2 / 3 pièces »). Tout vert → e-dossard débloqué ; déjà vert → accès direct à l'e-dossard. |
| E-dossard | App, espace coureur web | QR haute définition, lisible après 30 jours de cache, zéro réseau. Badge « HORS-LIGNE PRÊT ». Encodage : jeton unique édition (pas le dossard nu). Raccourci système recommandé (widget iOS / quick settings Android), fallback app : QR accessible en un geste écran verrouillé. |
| Bandeau sync | PWA volontaires, app | Compteur d'outbox toujours visible : « ◷ N passages en attente » en `{colors.sync-attente}` ; auto-sync au retour du réseau → « ✓ envoyés — file : 0 » en `{colors.sync-envoye}`. |
| Journal sync | PWA volontaires, app | Accès depuis le bandeau sync ; contenu : lots envoyés, rejets, offsets horloge ; lecture seule — l'auditabilité du chrono prime. |
| Tableau de bord live | Admin / PC | Retraits, partants, en course, arrivés, abandonnés, passages par checkpoint (lignes de board live). Fraîcheur = dernière sync, affichée. Temps réel (realtime) réservé à cette surface ; vitrine en SSE/polling. |
| Ligne de board live | Admin / PC | Tri par heure de passage décroissante ; mise à jour realtime sans flash complet de la liste ; non cliquable en V1. |
| Indicateur de fraîcheur | Toute donnée live | « synchronisé il y a X min » accolé aux chiffres ; jamais présenté comme instantané. |
| Alerte hors-délais | Admin / PC | Barrière horaire franchie : coureur attendu à un checkpoint, non-franchi → bloc `{colors.danger}` clignotant + texte intégral ; action : appeler le secteur → saisir l'abandon (lieu, motif, heure). |
| Carte publique | Vitrine | Tracé GPX + checkpoints, pastilles dossard `{colors.action}` ; positions > 1 h estompées ; dernière position connue affichée comme telle. Jamais de nom, contact ou photo. |
| Badge dossard | Toutes surfaces live | Numéro en mono, qualifié par édition. C'est le seul identifiant public. |
| Témoin live | Vitrine, admin | Point `{colors.danger}` pulsé sur « Résultats en direct » ; désactivé si `prefers-reduced-motion`. |
| Bloc sponsors | Vitrine | Option A (sponsor unique, emplacement signature) / option B (multiples, sans exclusivité) — bascule **sans dev**. Contractualisation hors application. |
| Vidéo trailer | Vitrine | *(Should)* Présente l'événement avec les images de la 1ʳᵉ édition : poster léger + lecture à la demande — la vidéo ne charge qu'au clic, **jamais dans le chemin critique** (< 300 Ko initial, < 5 s en 3G préservés). Dépend de la vérification de la matière 1ʳᵉ édition (voir Questions ouvertes). |
| Témoignages coureurs | Vitrine | *(Should)* Citations courtes + visage (avatar initiales en repli) + édition de référence ; ton sobre et crédible, jamais promotionnel ; pas de carrousel automatique. |
| Galerie photos | Vitrine | *(Could)* Grille par édition en chargement différé (lazy-load), hors budget du premier rendu ; aucune image dans le hero. |
| Avatar initiales | Vitrine, PWA | L'équipe montre ses visages (rôles nommés) ; l'initiale est le repli par défaut. |
| Frise kabyle | Vitrine, e-dossard | Décorative, en seuils ; jamais porteuse d'information ni cliquable. |
| Glyphe pilier | Vitrine | Les piliers sport/santé/citoyenneté/écologie portent chacun un petit glyphe inline amazigh sourcé (ⵣ Yaz, tala, tabzimt, ingel le cèdre) — 20–24 px, discret, pas de carte ni médaillon ; jamais mascotte ni logo politique/sacré ; l'identité se respire, ne s'expose pas. |
| Citation kabyle | App coureurs, ravitaillements, écrans départ/fin | Proverbe ancien (domaine public, source Hanoteau 1867 notée) UNIQUEMENT aux points d'usage : pédagogie batterie (« Un point après l'autre… »), départ/fin de course (« Il franchit les cols… »), ravitaillements (« Aman d laman »). Jamais groupée en section, jamais sur la vitrine d'accueil, jamais en zone critique. |
| Bandeau égide | Vitrine | « Sous l'égide de la Fédération et du ministère des Sports » — mention obligatoire, toujours visible. |
| Guide permission (iOS) | App coureurs | Écran dédié au piège « Autoriser une fois » : chemin Réglages complet + bouton « Ouvrir les Réglages ». |
| Pédagogie batterie | App coureurs | Partir à 100 %, ne pas tuer l'application, powerbank conseillée (en vente au village) — conclue par la citation kabyle « Un point après l'autre, et l'ouvrage est parfait » (source Hanoteau 1867). Alerte < 15 % (Should). |
| Bouton assistance | Espace coureur, app, PWA, vitrine | « Appeler l'équipe » — canal humain visible sur tout parcours qui peut coincer (SM-C1). Obligatoire dans : enveloppe d'erreur (Erreur API), email de refus de dossier, checklist incomplète, infos pratiques de la vitrine (en bouton, jamais enfoui). |
| Validation / refus de dossier | Admin | Refus toujours motivé ; le motif remonte au coureur par email, avec le numéro d'appel de l'équipe (SM-C1) — jamais de refus silencieux. |
| Bouton action / Bouton contour | Toutes surfaces | Un seul bouton action par vue ; le contour pour l'alternative (« Plus tard », « Venir encourager ») — jamais de faux choix. |
| Carte | Toutes surfaces | Conteneur de tout contenu structuré ; empilement une colonne, jamais de modale sur modale. |

## State Patterns

| État | Surface(s) | Traitement |
|---|---|---|
| Hors-ligne planifié | PWA volontaires, app | « HORS-LIGNE PRÊT » : aucune fonction critique ne dépend du réseau ; écriture locale dans l'outbox append-only. |
| Sync en attente | PWA, app | Bandeau `{colors.sync-attente}` + compteur visible ; jamais d'angoisse : la file est sûre. |
| Sync envoyée | PWA, app | Bandeau `{colors.sync-envoye}` « envoyés — file : 0 » ; journal sync consultable depuis le bandeau (→ composant Journal sync). |
| Erreur API | Toutes | Enveloppe d'erreur unique (définie dans `shared`) → message homogène + action à faire + bouton « Appeler l'équipe » (SM-C1) ; jamais de code brut. |
| Temps provisoire | Toutes | Jamais de temps « définitif » côté appareil : « classement provisoire » ; l'ordre d'arrivée serveur tranche, les horloges clientes n'ont jamais le dernier mot (→ Offline & Synchronisation). Doublons neutres (archivés, audit). |
| Fraîcheur / données figées | Vitrine, admin | « synchronisé il y a X min » ; si le réseau tombe, on continue — reprise automatique. |
| Phase de course (vitrine) | Vitrine | Avant : CTA « S'inscrire » dominant. Pendant : « Résultats en direct » + témoin live, CTA discret. Après : résultats + rappel de l'édition suivante. Classement vide avant le départ : « Pas encore de partants — départ à HH:MM ». |
| Permission localisation refusée | App | Suivi silencieusement inactif, aucune culpabilisation ; guide Réglages toujours accessible depuis l'app. |
| Permission caméra refusée / indisponible | PWA volontaires | Détection au premier lancement du scanner → écran dédié « Autoriser la caméra » : chemin Réglages complet (même gabarit que le guide permission iOS) + bouton assistance PC ; le scan ne démarre qu'une fois la caméra accessible. |
| Session révoquée | Toutes | Connexion ailleurs → sessions interactives antérieures révoquées (tous rôles) ; la boîte d'envoi survit (jeton d'appareil révocable séparément). |
| Code email erroné / expiré | Espace coureur | Message clair « code erroné ou expiré » ; aucun compte créé (FR-1) ; renvoi limité par un compte à rebours (limitation de rythme d'envoi). Saisie OTP : champ unique `inputmode="numeric"` `autocomplete="one-time-code"`, collage autorisé, durée de validité affichée. |
| Télversement preuve CCP | Espace coureur | Compression/redimensionnement côté client ≤ 300 Ko, avec feedback visible pendant compression et envoi. Rejet côté client des formats non image/PDF **avant envoi**, message listant les formats acceptés. Échec réseau : retry idempotent sans re-sélectionner le fichier, brouillon conservé localement, erreur doublée du bouton « Appeler l'équipe ». |
| Chargement à froid | Vitrine, admin | Squelettes calqués sur la mise en page finale ; GPX en chargement différé ; rendu lisible < 5 s en 3G. |
| Dossier vide / incomplet | Espace coureur | Checklist où chaque pièce manquante nomme l'action ; bouton « Appeler l'équipe » obligatoire (SM-C1). |
| Missions non couvertes | PWA, admin | Secteurs/missions en état couverte / vacante ; avertissement de chevauchement à l'import. |
| Import Excel volontaires | Admin | Rapport ligne par ligne (succès / erreurs) ; jamais d'import silencieux. |

## Interaction Primitives

- **Scan** : viser → bip + voyant < 1 s. Pas de confirmation intermédiaire, pas de retour arrière local. Canaux audio/haptique → spec complète au composant Caméra scan plein écran.
- **Tap d'abord** : aucune dépendance au survol (Android entrée de gamme, soleil sur l'écran du checkpoint).
- Cibles généreuses : ≥ 48 dp Android / 44 pt iOS, voyants et bandeaux géants côté volontaire ; gap ≥ 8 px entre cibles interactives ; aucune action critique collée au bord de l'écran ; bouton pause/stop du scan ≥ 64 dp.
- Admin : clic + rafraîchissement automatique (realtime) ; la fraîcheur reste affichée quoi qu'il arrive.
- Motion dosé : pulsation du témoin live, ligne de balayage, clignotement des alertes — tout désactivé sous `prefers-reduced-motion`.
- **Bannis** : gestes cachés, navigation par carrousel, fonctionnalité critique dépendante du réseau, suppression de passages côté appareil, temps « définitif » affiché par un appareil.

## Accessibility Floor

Comportementale. Les contrastes vivent dans `DESIGN.md` → Colors.

- Contrastes **AA+** visés : ≥ 4,5:1 textes courants, ≥ 3:1 grands textes, dans les deux modes — vérifiés sur les paires porteuses (encre/brume, opérationnelles/encres).
- **SM-C1** : le self-service ne doit pas exclure les coureurs peu à l'aise avec le numérique — assistance humaine toujours visible, libellés concrets, frappe généreuse (jamais < 15 px sur contenus critiques).
- Jamais la couleur seule : voyants doublés d'un bip (audio) et d'un texte intégral ; alertes clignotantes doublées du libellé. Clignotements bornés ≤ 1 flash/s (période ≥ 1 s), jamais de stroboscope.
- Cibles terrain : règles complètes aux Interaction Primitives (≥ 48 dp, gap ≥ 8 px, bords, pause/stop ≥ 64 dp).
- Lecteur d'écran : rôle + état sur tout élément interactif ; annonces du Voyant scan (live region, états distincts, état caméra au démarrage) → spec complète au composant Voyant scan.
- Zoom : navigateur testé à 200 %, pinch-zoom jamais désactivé (`user-scalable=no` interdit), textes sans troncature à 200 %.
- Icônes : toute icône porte un libellé accessible ; toute décoration (frise kabyle, silhouettes SVG) est `aria-hidden="true"`.
- Tailles système honorées sur l'app native `[ASSUMPTION : mécanisme exact (dynamic type) à arbitrer avec l'implémentation Expo]`.
- `prefers-reduced-motion` : point live, ligne de balayage, clignotements → états statiques.
- Ordre de focus = ordre de lecture sur chaque surface ; focus visible : contour 2 px `{colors.action}` (mode clair) / `{colors.action-sombre}` (mode sombre), offset 2 px — `outline` jamais supprimé.

## Offline & Synchronisation

Patterns comportementaux de la sync visible — le cœur du produit (« offline-first radical », zones blanches) :

- **« L'appareil propose, le serveur dispose. »** Aucun appareil ne décide : pas d'ordre de classement local, pas de suppression locale ; l'ordre d'arrivée serveur tranche ; premiers passages reçus = font foi, suivants archivés (audit) et neutres ; premiers abandons concurrents gagnent ; les positions ne sont pas un classement (dernière reçue par appareil fait foi).
- **Outbox visible** : la boîte d'envoi n'est jamais une boîte noire — compteur en attente, confirmation de lot, journal sync (lots, rejets, offsets horloge) ; l'auditabilité du chrono prime.
- **Lots idempotents** au retour du réseau (clé naturelle : édition + coureur + checkpoint) — la reconnexion ne crée jamais de doublon visible.
- **Scan au départ = contrôle de présence**, jamais référence horaire de classement ; heures de départ officielles configurées côté serveur.
- La vitrine publique et l'espace coureur web restent en ligne (pas de mode hors-ligne au MVP) — l'offline est assumé là où il est critique : volontaires, coureurs, e-dossard.
- Horodatages ISO 8601 UTC stockés, affichés en heure locale — jamais de fuseau ambigu côté bénévole.

## Anonymat & Vie privée

- Carte publique : **numéro de dossard qualifié par édition uniquement** — jamais nom, contact ou photo sur les canaux publics.
- Positions > 1 h **estompées** ; la dernière position connue est affichée comme telle.
- Tracking **opt-in** ; « désactivé : rien n'est enregistré ». Fenêtre 5–10 min, précision équilibrée ; ne pas augmenter la fréquence au prix de la batterie (SM-C2).
- Liens de résultats partagés avec paramètre de suivi anonyme, compté côté serveur (SM-5).
- Les seuls identifiants publics traversant les canaux SSE/polling : dossard + position.

## Jour J — Mode Opératoire

- **Scan** : bip + feu vert `{colors.succes}` < 1 s par coureur ; 3 scanneurs par checkpoint pour absorber les files ; voyant rouge `{colors.danger}` sur doublon (« DÉJÀ PASSÉ ») ou inconnu.
- **PC course** : alertes hors-délais clignotantes `{colors.danger}` (barrières horaires) ; saisie rapide des abandons (lieu, motif, heure) ; annulation auditable des passages erronés — jamais de suppression.
- **Guichets express** : ~700 retraits le jour J (~300 en avance), voyant doublon au retrait ; cible < 5 min d'attente par coureur.
- **Vitrine en direct** : « Résultats en direct » (témoin live) également affiché sur le grand écran de la place du village — il s'agit de la vitrine publique en plein écran, pas d'une surface dédiée ; classements séparés par catégorie, départs échelonnés ; « classement provisoire » affiché en toutes lettres.
- **Batterie** : pédagogie avant la course (100 %, tueur d'applications, powerbank) ; alerte < 15 % (Should) ; powerbanks en vente au village.
- **Zéro papier** : e-dossard QR partout ; synchronisation NTP des téléphones bénévoles au QG ; dry-run général avant le jour J.

## Inspiration & Anti-patterns

Référence : **azronthor.com** (Trail Azro n'thor, Tirourda, Kabylie — l'utilisateur aime l'ambiance générale).

- **Gardé — structure vitrine complète** : date/départs, parcours, équipe organisatrice avec visages et rôles, témoignages, galerie, sponsors/partenaires. La vitrine d'Azzel reprend cette exhaustivité en plus léger.
- **Gardé — signaux de crédibilité** : labels type ITRA/UTMB chez Azro n'thor → égide fédération + ministère, chiffres du village, visages nommés.
- **Gardé — ancrage humain et local** : l'organisation montre ses visages ; « une course portée par son village ».
- **Récupérés sur décision utilisateur (2026-10-20)** : témoignages coureurs (Should), galerie photos en lazy-load (Could), historique des éditions via le socle multi-organisation (Could), vidéo trailer avec les images de la 1ʳᵉ édition (Should, lecture à la demande).
- **Dimension amazigh (2026-10-20, recherche sourcée)** : glyphes piliers discrets ⵣ Yaz / tala / tabzimt / ingel retenus — l'identité se respire, ne s'expose pas (apparat et cartes-dévotes écartés sur demande utilisateur) ; proverbes Hanoteau 1867 aux points d'usage seulement ; récits « vieille de janvier » (sécurité) et « singes sacrés du Jurjura » (écologie) = contenu éditorial de la page région. Rejetés : « Tafsut » comme label (charge politique), drapeau amazigh, Tanit sans étiquette, Lalla Khedidja en logo, récit d'Anzar (non retenu), gypaète « réintroduit » (inexact). Sources : `.working/research-amazigh-mythologie.md`, `.working/research-poesie-kabyle.md`.
- **Rejeté — grandes photos montagne immersives** : lourdes, incompatibles avec < 300 Ko / < 5 s en 3G ; remplacées par dégradés, SVG et typographie.
- **Rejeté — WordPress paginé** : structure éditoriale vieillissante ; Azzel est une application web moderne, cache + SSE/polling.
- Directions de design écartées (contraste) : `.working/direction-altitude.html`, `.working/direction-sport-data.html`, `.working/direction-zenithal.html` — le registre Village a été retenu.

## Responsive & Platform

| Contexte | Comportement |
|---|---|
| Android entrée de gamme (scanneurs, coureurs) | Scan QR via `BarcodeDetector` si dispo, fallback `@zxing/browser` ; aucune dépendance au survol ; motion dosé ; < 1 s qualifié sur le fallback. |
| iOS Safari (PWA volontaires) | `@zxing/browser` toujours actif (BarcodeDetector désactivé par défaut) ; PWA installable depuis Safari. |
| App native Expo (coureurs) | Tracking GPS arrière-plan (impossible en PWA) ; stores avec soumission anticipée ; repli APK sideload. |
| Écrans hétérogènes | Vitrine mobile-first : marges `{spacing.margin-mobile}`, colonnes empilées, hero SVG inline ; `display` réduit (44–48 px `[ASSUMPTION]`). |
| PC de course | Grand écran / laptop ; realtime réservé admin ; fraîcheur toujours affichée. |
| Mode sombre | Défaut = préférence système + override mémorisé ; toggle visible dans l'en-tête ; opérationnelles jour J inversées pour la nuit (départs à l'aube, postes de nuit) ; PWA volontaires : sombre proposé à la première ouverture (préparation la veille). |
| `prefers-reduced-motion` | Pulsations, balayage, clignotements → statique. |

## Key Flows

### UJ-1 — Yacine s'inscrit à la longue et boucle son dossier seul (étendu : installation app + tracking) (Yacine, 28 ans, coureur à Alger)

→ Wireflow : `wireframes/flow-app-coureur-2026-10-20.excalidraw`. Réalise FR-1 à FR-7, FR-18 à FR-20 (mapping étendu vs PRD §2.3 : installation de l'app et tracking intégrés au parcours Yacine).
→ Maquette 1:1 — checklist incomplète + e-dossard hors-ligne : `mockups/key-edossard.html`.

1. Découvre la vitrine partagée sur Instagram → « S'inscrire » ({colors.action}).
2. Crée son accès : email + code à 6 chiffres ; session unique par compte.
3. Remplit le formulaire d'inscription à l'édition : épreuve Longue (~35 km), taille de t-shirt ; accepte décharge et règlement intérieur (horodatés, version conservée) ; téléverse sa preuve de paiement CCP (compressée ≤ 300 Ko côté client).
4. Suit sa checklist : chaque pièce manquante nomme l'action à faire (« Dépose ta preuve de paiement CCP »).
5. **Premier climax :** checklist au vert « Dossier validé — dossard prêt » — e-dossard QR disponible hors-ligne.
6. Installe l'app native (Play Store / App Store ; repli APK sideload sans store) ; se connecte — même compte.
7. Active le suivi GPS — opt-in explicite : 5–10 min, précision équilibrée, « Désactivé : rien n'est enregistré ».
8. Piège iOS « Autoriser une fois » : le suivi s'arrête → écran guide « Réglages > Azzel > Localisation > Toujours » + bouton « Ouvrir les Réglages ».
9. Pédagogie batterie : partir à 100 %, ne pas tuer l'application, powerbank conseillée.
10. À J-7, reçoit le rappel email : « Pense à activer ton suivi » → bouton vers l'app.
11. **Climax : jour J, suivi actif** — sa position apparaît sur la carte publique (n° de dossard qualifié par édition, anonymat préservé).

Échecs : code email erroné/expiré → aucun compte créé, message clair, renvoi limité par compte à rebours ; échec d'envoi de la preuve CCP → retry idempotent sans re-sélectionner le fichier, brouillon conservé, bouton « Appeler l'équipe » ; tout autre blocage → bouton « Appeler l'équipe » visible (SM-C1) ; permission refusée → suivi silencieusement inactif, aucune culpabilisation, guide Réglages toujours accessible ; reconnexion sur un autre appareil → session révoquée mais la boîte d'envoi survit (jeton d'appareil) ; dossier déjà vert à l'installation → accès direct à l'e-dossard (étape 5 court-circuitée).

### UJ-2 — Karim scanne en zone blanche toute la matinée (Karim, 19 ans, volontaire du village, scanneur au ravitaillement 2)

→ Wireflow : `wireframes/flow-scan-2026-10-20.excalidraw`. Réalise FR-8 à FR-14 (amont admin FR-9/FR-10 en intro).
→ Maquette 1:1 — caméra plein écran, trois états du voyant, bandeau sync : `mockups/key-scan.html`.

Amont admin (Nadia, avant le jour J) : **1)** import Excel volontaires — rapport ligne par ligne, jamais d'import silencieux ; **2)** affectation des secteurs et missions — chevauchements signalés ; **3)** couverture vérifiée, aucune mission vacante, avant le jour J. Puis, côté volontaire :

1. Reçoit son invitation (import Excel) ; définit son mot de passe à la première connexion (PWA).
2. Découvre ses missions : « Ravitaillement 2 — secteur Djurdjura-ouest, 3 scanneurs, dimanche 06:00 » ; consultable hors-ligne.
3. La veille : fiche mission hors-ligne dans son téléphone (secteur, rôle, horaires 06:00 → 14:00, contact PC, consignes).
4. Jour J, zéro réseau : caméra plein écran, annuaire coureurs préchargé (IndexedDB).
5. Vise un dossard → **bip + feu vert {colors.succes} en < 1 s** : « ✓ Passage enregistré — dossard 217, checkpoint 2, 10:42:07 » ; stocké en local, file d'attente +1.
6. Variations : re-scan du 217 → voyant rouge « ↻ DÉJÀ PASSÉ — vu à 10:15:33 » (le premier passage reste) ; numéro absent de l'annuaire → voyant rouge « ⚠ DOSSARD INCONNU — revérifier » + bouton appel direct au PC.
7. À 14 h, une barre de réseau apparaît : auto-sync par lots idempotents.
8. **Climax :** « 217 passages en attente → envoyés — file : 0 ».

Règles d'échec : jamais de suppression locale (annulation auditable côté admin uniquement) — canon → Offline & Synchronisation ; caméra refusée ou indisponible au premier lancement du scanner → écran « Autoriser la caméra » (chemin Réglages complet + bouton assistance PC), le scan ne démarre pas sans caméra ; batterie du volontaire : powerbank fournie par le club.

### UJ-3 — Nadia pilote la course au PC (Nadia, organisatrice, PC course)

Réalise FR-15 à FR-26. Maquette 1:1 — tableau de bord live + alerte hors-délais : `mockups/key-pc-live.html`.

1. Matin : tableau de bord live — retraits, partants par épreuve ; fraîcheur = dernière sync, affichée.
2. Midi : **climax — une alerte hors-délais clignote** ({colors.danger}) : un coureur attendu au checkpoint 3 ne l'a pas franchi.
3. Elle appelle le secteur (contact de la mission) ; décision : abandon saisi avec lieu, motif, heure.
4. Soir : classements publiés (par catégorie, départs échelonnés) et partagés via URLs.
5. Lendemain : export du rapport chiffré pour le directoire.

Échec : réseau dégradé au PC → les chiffres restent affichés avec leur fraîcheur (« synchronisé il y a X min »), jamais présentés comme instantanés ; les alertes déjà émises restent visibles.

### UJ-4 — Malika suit son frère depuis Tizi Ouzou (Malika, proches / médias / fédération)

Réalise FR-18 à FR-23.

1. Ouvre la vitrine publique — sans compte, sur son téléphone.
2. Carte live : dernière position GPS connue de son frère sur le tracé GPX ; dossards anonymes, positions > 1 h estompées.
3. **Climax :** elle voit son frère franchir le checkpoint 2 — le classement live se met à jour.
4. Elle partage le lien de résultats (suivi anonyme compté côté serveur).

Échec : tracking désactivé par son frère → aucune position enregistrée ; seuls les passages aux checkpoints racontent la course, et la carte le dit sans inquiéter (« dernière position connue »).

## Questions ouvertes

- Nombre exact de checkpoints par épreuve (hypothèse : 4 longue / 1–2 moyenne) et barrières horaires — impacte carte, alertes, PC.
- Classements par sexe et catégories d'âge : à confirmer (crédibilité fédération).
- **Inscription sur place** (coureurs sans email/smartphone, repli manuel au guichet) — à trancher avant le 15/11/2026.
- Mécanique des créneaux de guichets (~700 retraits le jour J) : à designer.
- Alerte batterie < 15 % : Should, forme à confirmer.
- Cibles SM-5 (partages) et SM-6 (activation tracking) : à chiffrer avec l'organisateur.
- Bibliothèque cartographique vitrine (Leaflet vs MapLibre) et rendu GPX : choix local du module.
- Mécanisme d'auth précis (Supabase Auth + révocation vs jetons maison) : à l'implémentation du module `iam` — affine les parcours de révocation.
- Format et moteur des exports de rapports : local au module `admin`.
- Données de la 1ʳᵉ édition (Should) : existence et format à vérifier — conditionne le trailer vidéo, les témoignages et la galerie.
