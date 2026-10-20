# Validation Report — Azzel

- **DESIGN.md:** /Users/mouloudhaouili/Desktop/ouidou/Azzel/_bmad-output/planning-artifacts/ux-designs/ux-Azzel-2026-10-20/DESIGN.md
- **EXPERIENCE.md:** /Users/mouloudhaouili/Desktop/ouidou/Azzel/_bmad-output/planning-artifacts/ux-designs/ux-Azzel-2026-10-20/EXPERIENCE.md
- **Run at:** 2026-10-20T14:14:50Z

## Overall verdict

Paire solide, immédiatement consommable comme contrat par l'architecture et les stories : les 4 UJ sont marchées avec climax et échecs, les 27 tokens couleur ont hex + paire clair/sombre, toutes les références `{path.to.token}` résolvent, et les contrastes énoncés tiennent numériquement (toutes paires porteuses recalculées ≥ 5,4:1, objectif AA+ vérifié). Les gaps sont concentrés et peu nombreux : un état critique manquant (permission caméra refusée pour le scan PWA, jour J sans filet), deux composants sans contrat comportemental complet (ligne de board live, journal sync), et trois désalignements de noms de composants entre spines.

La revue accessibilité nuance ce tableau sans le renverser : le socle est sain — 37/38 paires hex passent WCAG AA avec marge et l'intention accessibilité (bip + texte, cibles 48 dp, plancher 15 px, reduced-motion, assistance humaine) est réellement écrite dans les spines — mais les défaillances restantes sont de spécification, pas d'intention : une paire en échec que le rubric n'avait pas testée (bouton lecture vidéo, 2,08:1), deux canons jour J non chiffrés (fréquence du clignotement, dimensions du voyant scan), une contradiction interne (meta 12 px vs plancher 15 px), et un SM-C1 déclaré composant mais jamais placé dans les flux et états d'erreur. Tout est corrigeable dans les documents avant moindre ligne de code.

**Décompte consolidé (rubric + accessibilité) : 0 critical · 5 high · 16 medium · 12 low — 33 findings.**

## Category verdicts

### 1. Flow coverage — strong

Les 4 UJ du PRD §2.3 sont présentes comme Key Flows, protagoniste nommé avec contexte (Yacine 28 ans, Karim 19 ans, Nadia, Malika), étapes numérotées (11/8/5/4), climax explicites, et chemin d'échec pour chacune (EXPERIENCE.md:186-240). Le mapping FR est affiché par flow ; FR-27 est couvert dans les transverses IA (EXPERIENCE.md:41). Wireflows liés pour UJ-1 et UJ-2. — 2 findings (2 low).

### 2. Token completeness — strong

Les 27 couleurs ont un hex et existent en paire clair/sombre (structure + 5 opérationnelles avec encres) — aucune CRITIQUE. Palette vérifiée identique à la variation 5 de `.working/color-themes-1.html` (source canonique déclarée). Toutes les références `{colors.*}`, `{typography.*}`, `{rounded.*}`, `{spacing.*}` des deux spines résolvent vers le frontmatter DESIGN. Contrastes énoncés pour les combinaisons porteuses et recalculés conformes : encre/brume 13,66:1 ; minimum relevé = blanc/succès clair 5,40:1 — l'objectif ≥ 4,5:1 / ≥ 3:1 (DESIGN.md:196) tient sur les 23 paires testées, deux modes compris. — 1 finding (1 low).

### 3. Component coverage — adequate

Couverture quasi bijective : 27 composants avec spec visuelle dans DESIGN.Components, 25 lignes comportementales dans EXPERIENCE.Component Patterns, « mêmes noms » déclaré des deux côtés (DESIGN.md:237, EXPERIENCE.md:63). Exemple de paire complète : Bouton assistance (DESIGN.md:241 + EXPERIENCE.md:88, SM-C1 cité). Trois exceptions. — 3 findings (2 medium, 1 low).

### 4. State coverage — adequate

Solide sur le cœur produit : hors-ligne planifié, sync attente/envoyée, erreur API enveloppe unique, temps provisoire/doublons neutres, fraîcheur/figée, permission localisation refusée, session révoquée, upload CCP, chargement à froid, dossier vide, missions vacantes, import Excel — 13 états avec traitement (EXPERIENCE.md:93-109). Trous sur les états d'échec edge. — 5 findings (1 high, 3 medium, 1 low).

### 5. Visual reference coverage — strong

Les 8 artefacts visuels de `.working/` sont tous liés inline à la section pertinente en nommant ce qu'ils illustrent : les 5 HTML dans DESIGN.md:172 ; les 3 excalidraw dans EXPERIENCE (ia → IA:31, flow-app-coureur → UJ-1:188, flow-scan → UJ-2:206). `imports/` vide. La règle « spines gagnent » est énoncée une fois (EXPERIENCE.md:27) et démontrée par un vrai cas (certificat médical / pièce d'identité dans le wireflow vs PRD fait foi). Aucune référence vague aux maquettes. — 1 finding (1 low).

### 6. Bloat & overspecification — strong

DESIGN porte la voix éditoriale (Brand & Style, registre Village) — légitime ; EXPERIENCE reste factuelle, en tableaux, sans prose éditoriale. Les détails pixel vivent dans DESIGN où ils sont de la spec visuelle, pas de l'overspec. Le tableau IA reprend le PRD mais y ajoute l'accès et le contenu par surface — valeur aval réelle. MoSCoW verbatim sans redéfinition. — 1 finding (1 low).

### 7. Inheritance discipline — strong

Les 5 sources du frontmatter EXPERIENCE résolvent (chemins vérifiés). Le vocabulaire des sources est repris fidèlement et activement : outbox append-only, lots idempotents, clé `(édition, coureur, checkpoint)` = AD-8, jeton unique édition dans le QR = AD-8, session unique + jeton d'appareil = AD-5, enveloppe d'erreur unique, SSE/polling + realtime réservé admin, BarcodeDetector/@zxing iOS, NTP/dry-run/3 scanneurs/~700-300/powerbanks = addendum brief, J-10 = FR-26. Les refs token EXPERIENCE → DESIGN résolvent toutes. SM-C1/SM-C2/SM-5/FR-27 cités à bon escient. — 1 finding (1 low) + voir cat. 3 pour les noms de composants divergents (point d'inheritance le plus fragile).

### 8. Shape fit — strong

DESIGN : les 8 sections canoniques présentes dans l'ordre verrouillé exact (Brand & Style → Do's and Don'ts). Frontmatter conforme au spec. EXPERIENCE : tous les defaults présents ; triggered présents tous les deux ; Key Flows en dernier. Sections inventées (« Offline & Synchronisation », « Anonymat & Vie privée », « Jour J — Mode Opératoire », « Questions ouvertes ») toutes justifiées par le produit et cohérentes avec la pratique des documents amont. — 1 finding (1 low).

### Revue accessibilité (review-accessibilite.md)

Le socle est solide : sur 38 paires hex calculées, 37 passent WCAG AA avec marge, et l'intention accessibilité (bip + texte, cibles 48 dp, plancher 15 px, reduced-motion, assistance humaine) est réellement écrite dans les spines. Les défaillances restantes sont de spécification, pas d'intention : une paire WCAG en échec (bouton lecture vidéo), deux canons jour J non chiffrés, une contradiction interne (meta 12 px vs plancher 15 px), et un SM-C1 déclaré mais jamais placé dans les flux/états d'erreur. Points forts : palette mathématiquement saine, jamais la couleur seule structurellement, SM-C1 présent dans l'intention, lisibilité terrain pensée, offline sans angoisse, contraintes réelles intégrées. — 19 findings (4 high, 11 medium, 4 low).

## Findings by severity

### Critical

Aucun finding critical.

### High

- **State coverage/rubric** — Permission caméra refusée / caméra indisponible (§ EXPERIENCE.md State Patterns, absence) : le scan est LA fonction jour J sans filet ; aucun état ne couvre « caméra bloquée », « permission refusée », « caméra occupée » ; le fallback `@zxing/browser` est couvert, pas la permission. **Fix** : ligne State Patterns (détection au premier lancement du scanner → écran dédié « Autoriser la caméra » avec chemin Réglages, mirroring du Guide permission iOS + assistance PC) + étape d'échec dans UJ-2.
- **Contrastes/accessibilité** — F-01 · Bouton lecture vidéo illisible sur son propre bloc sombre (§ DESIGN.md frontmatter L151-154, L256) : `bloc-video` = dégradé `#1B281F → #101A14` avec `playButton: '{colors.action}'` = `#345E4A` ; ratios calculés 2,08:1 et 2,41:1 — sous le seuil 3:1 UI de WCAG 1.4.11 ; composant figé en couleur clair, sans variante sombre. **Fix** : bouton en `{colors.action-sombre}` `#8FD4A8` (8,87:1) ou blanc plein sur les deux modes ; ajouter la paire play/bloc au frontmatter comme paire testée.
- **Photosensibilité/accessibilité** — F-04 · « Lampe clignotante » du voyant danger sans fréquence spécifiée (§ DESIGN.md L246 ; EXPERIENCE.md L68) : WCAG 2.3.1 exige ≤ 3 flashs/s ; rien ne borne la fréquence, composant jour J manipulé par 150–200 volontaires. **Fix** : clignotement ~1 Hz (période ≥ 1 s) par alternance on/off, jamais de stroboscope ; même borne généralisée en règle (alerte hors-délais déjà conforme à ~1,1 s).
- **Lisibilité terrain/accessibilité** — F-06 · `meta` à 12 px contredit le plancher « jamais < 15 px critiques » (§ DESIGN.md L69-71, L206-207 ; EXPERIENCE.md L125) : `typography.meta` est affectée aux heures de passage, bandeau e-dossard, fraîcheur — données chrono/audit critiques jour J. **Fix** : monter les occurrences critiques à 14–15 px mono, ou lister explicitement lesquelles restent 12 px et passer heures/fraîcheur/bandeau au-dessus du plancher.
- **SM-C1/accessibilité** — F-09 · Bouton assistance déclaré mais jamais placé dans les flux ni les états d'erreur (§ EXPERIENCE.md L88, L100, L186-202) : UJ-1 ne le mentionne à aucune étape ; l'état « Erreur API » n'exige pas le numéro humain ; l'email de refus n'a pas de canal d'appel ; la vitrine n'a pas de contact en bouton. **Fix** : « Appeler l'équipe : +213 … » obligatoire dans l'enveloppe d'erreur, l'email de refus, la checklist incomplète et les infos pratiques vitrine ; étape d'échec dans UJ-1.

### Medium

- **Component coverage/rubric** — Ligne de board live sans règle comportementale (§ DESIGN.md:251 vs EXPERIENCE.md:73) : spec visuelle dédiée mais zéro règle comportementale propre (tri, ordre, realtime, interaction) ; composant central du PC course. **Fix** : ligne dédiée dans Component Patterns (tri par heure de passage décroissante, mise à jour realtime sans flash complet, non cliquable en V1 ou comportement défini).
- **Component coverage/rubric** — Journal sync sans composant porteur (§ EXPERIENCE.md:99, 137) : mentionné deux fois comme « consultable » mais aucun composant ne le porte, ni visuel ni comportemental ; le dev devra inventer la surface d'un élément d'auditabilité déclaré « prime ». **Fix** : entrée Journal sync dans DESIGN.Components (liste mono sur carte, `{typography.meta}`) + Component Patterns (accès depuis le bandeau sync, lecture seule).
- **State coverage/rubric** — Code email erroné/expiré non traité (§ EXPERIENCE.md:100-105 ; UJ-1 étape 2) : FR-1 exige « un code expiré ou erroné ne crée pas de compte » ; ni State Patterns ni les échecs d'UJ-1 ne traitent la saisie invalide. **Fix** : état dédié (message + renvoi limité, cohérent avec la limitation de rythme d'envoi) + mention dans les échecs UJ-1.
- **State coverage/rubric** — Rejet de format à l'upload CCP (§ EXPERIENCE.md:105) : l'état « Upload preuve CCP » couvre compression et feedback, pas le rejet des formats non image/PDF exigé par FR-4 (« message clair »). **Fix** : compléter la ligne (rejet côté client avant envoi, message reprenant les formats acceptés).
- **State coverage/rubric** — États temporels de la vitrine avant/pendant/après course (§ absence ; cf. reconcile-azronthor.md §Double CTA) : CTA adapté à la phase promis par la réconciliation mais absent des State Patterns ; « résultats vides avant départ » non plus. **Fix** : trois colonnes d'état vitrine (avant : CTA S'inscrire dominant ; pendant : Résultats en direct + témoin ; après : résultats + historique) ou renoncer explicitement dans les Questions ouvertes.
- **Contrastes/accessibilité** — F-02 · Voile d'overlay caméra à 93 % : contraste non garanti (§ DESIGN.md L196, L245) : badges « · LIVE », heure, overlay dossard reposent sur un voile semi-transparent au-dessus du flux caméra — le contraste varie avec la scène filmée (plein soleil → voile écrasé). **Fix** : fond quasi opaque (≥ 96 %) derrière tout texte du pied de cadre, ou texte sur pastille pleine ; règle ajoutée au composant Caméra scan.
- **Photosensibilité/accessibilité** — F-05 · Le bip audio a trois points de défaillance non couverts (§ EXPERIENCE.md L67, L113, L127, L153) : autoplay navigateur non débloqué (pas de tap après lancement du scan), téléphone en silencieux/volume bas, bruit du ravitaillement (1000 coureurs) ; aucun canal haptique. **Fix** : débloquer l'audio au tap « Démarrer le scan » ; vibration (Vibration API / haptique natif) en troisième canal ; bip distinct doublon vs inconnu (deux mélodies, pas deux volumes).
- **Lisibilité terrain/accessibilité** — F-07 · Voyant scan « géant » sans dimension chiffrée (§ DESIGN.md L246) : aucune taille de texte, hauteur de pill, ni graisse spécifiée pour le composant n°1 du jour J, lu en plein soleil à 50 cm. **Fix** : texte ≥ 24 px / graisse 800, heure mono ≥ 16 px, pill ≥ 96 px de haut, plein cadre ; graisse ≥ 700 partout sur ce composant.
- **Lisibilité terrain/accessibilité** — F-08 · Zoom pincer/navigateur non garanti (§ EXPERIENCE.md L120-130) : aucune mention interdisant `user-scalable=no` / viewport zoomé ; Accessibility Floor muet ; coureurs presbytes mal servis. **Fix** : ajouter au floor : zoom navigateur 200 % testé, pinch-zoom jamais désactivé, textes sans troncature à 200 %.
- **SM-C1/accessibilité** — F-10 · « DOSSARD INCONNU — signaler au PC » : l'action est nommée, pas actionnable (§ EXPERIENCE.md L68, L213 ; DESIGN.md L249) : le voyant rouge n'offre pas l'appel direct ; le contact PC cliquable vit dans la fiche mission, à deux écrans, sous stress. **Fix** : bouton appel direct sur l'écran d'erreur inconnu (et sur le doublon en variante silencieuse).
- **Lecteur d'écran/accessibilité** — F-11 · Annonce du scan sans mécanisme spécifié (§ EXPERIENCE.md L127) : pas de live region, pas d'annonce du doublon avec l'heure du 1er passage, ni de l'état caméra au lancement. **Fix** : `role="status"` / `aria-live="assertive"` sur le voyant ; annonces distinctes succès / doublon (+ heure) / inconnu ; état « caméra active / annuaire chargé » annoncé au démarrage.
- **Lecteur d'écran/accessibilité** — F-12 · Focus visible non spécifié (§ EXPERIENCE.md L130) : « Ordre de focus = ordre de lecture » couvre l'ordre, jamais la visibilité — indispensable pour l'admin au clavier (PC course). **Fix** : focus visible 2 px `{colors.action}` / `{colors.action-sombre}` selon mode, offset 2 px, `outline` jamais supprimé.
- **Formulaires/accessibilité** — F-14 · Code à 6 chiffres : pattern de saisie non spécifié (§ EXPERIENCE.md L193) : les OTP à cases séparées sont un piège classique (collage, autofill, lecteur d'écran). **Fix** : champ unique `inputmode="numeric"` `autocomplete="one-time-code"`, collage autorisé, durée de validité affichée, renvoi avec compte à rebours.
- **Formulaires/accessibilité** — F-15 · Télversement CCP : l'échec réseau n'a pas de traitement (§ EXPERIENCE.md L105, L43) : l'espace coureur est en ligne uniquement — envoi échoué en 3G : ni reprise, ni conservation du fichier, ni assistance. **Fix** : retry idempotent sans re-sélectionner le fichier, brouillon conservé localement, message d'erreur doublé du bouton « Appeler l'équipe » (rejoint F-09).
- **Mode sombre/accessibilité** — F-16 · Bascule sombre : défaut, placement et mémorisation non spécifiés (§ EXPERIENCE.md L25, L181 ; DESIGN.md L170) : aucun toggle, pas de `prefers-color-scheme`, pas de choix mémorisé ; une PWA qui s'ouvre en clair à l'aube (départ 06:00) éblouit. **Fix** : défaut = préférence système + override mémorisé ; toggle visible dans l'en-tête de chaque surface ; proposer le sombre à la première ouverture la veille (checklist).
- **Jour J/accessibilité** — F-17 · Mains mouillées / boue : espacement des cibles non spécifié (§ EXPERIENCE.md L118) : 48 dp ok, gestes cachés bannis, mais rien sur l'espacement entre cibles adjacentes ni les actions en bord d'écran (fausses touches du pouce, gants). **Fix** : gap ≥ 8 px entre cibles interactives ; aucune action critique collée au bord ; bouton pause/stop du scan ≥ 64 dp.

### Low

- **Flow coverage/rubric** — Mapping UJ-1 élargi vs PRD §2.3 (§ EXPERIENCE.md:188) : UJ-1 annonce « FR-1 à FR-7, FR-18 à FR-20 » alors que le PRD borne UJ-1 à FR-1 à FR-7 ; élargissement cohérent mais divergent de la source. **Fix** : garder le mapping spine mais ajouter « (étendu vs PRD §2.3 : tracking intégré) ».
- **Flow coverage/rubric** — Amont admin (FR-9/FR-10) non marché en flow (§ EXPERIENCE.md:204-217, UJ-2) : import Excel volontaires et création secteurs/missions couverts structurellement (IA + State Patterns), pas dynamiquement. **Fix** : 3 étapes d'intro à UJ-2 ou une phrase pointer vers IA/State Patterns.
- **Token completeness/rubric** — Paires sombres des opérationnelles jamais référencées token par token (§ DESIGN.md:194, 247) : seul le succès est cité ; `{colors.texte-2-sombre}` n'est consommé nulle part. **Fix** : une ligne par opérationnelle sombre ou mini-tableau fg/bg sombre ; consommer `texte-2-sombre` dans au moins un composant.
- **Component coverage/rubric** — Grand écran de la place du village non spécifié (§ EXPERIENCE.md:156) : surface évoquée une fois sans composant, sans ligne Responsive, sans source PRD. **Fix** : « vitrine publique en plein écran, pas une surface dédiée » ou spécifier.
- **State coverage/rubric** — Classement vide / « pas encore de partants » (§ EXPERIENCE.md:102) : couvert seulement implicitement par la ligne Fraîcheur. **Fix** : libellé dédié dans la ligne Fraîcheur.
- **Visual reference coverage/rubric** — Orphelins dans .working/ (§ WS/.working/) : `source-extract-*.md` non liés ; la règle « tout fichier .working est lié » n'est pas tenue à la lettre. **Fix** : une ligne dans IA ou Foundation ou déplacement hors .working.
- **Bloat & overspecification/rubric** — Formule « l'appareil propose, le serveur dispose » répétée à 4 endroits (§ EXPERIENCE.md:41, 100-101, 134-141, 217) : un patch sur l'un des 4 endroits dérivera. **Fix** : section « Offline & Synchronisation » comme canon, les autres occurrences en renvois.
- **Inheritance discipline/rubric** — Titre d'UJ-1 reformulé vs PRD §2.3 (§ EXPERIENCE.md:186) : « installe l'app » ajouté au libellé source. **Fix** : conserver le libellé source en préfixe avec mention de l'extension.
- **Shape fit/rubric** — « Questions ouvertes » n'est pas une section canonique DESIGN (§ DESIGN.md:283-287, EXPERIENCE.md:242-253) : justifiée (lieu de vie des `[ASSUMPTION]`), à garder balisée. **Fix** : aucune si le gabarit l'accepte ; sinon fusionner dans Do's and Don'ts ou Brand & Style.
- **Contrastes/accessibilité** — F-03 · Séparation tonale cartes/fond très faible, 1,10:1 / 1,16:1 (§ DESIGN.md L181, L196, L242) : pas un échec WCAG strict, mais sous soleil la structure de page se dissout. **Fix** : filet à 25–30 % d'opacité ou fond légèrement assombri ; à trancher avec le registre « pas d'ombre ».
- **Lecteur d'écran/accessibilité** — F-13 · Libellés d'icônes non généralisés (§ DESIGN.md L260) : aucun `aria-label` exigé ; frise kabyle déclarée décorative mais sans `aria-hidden` explicite. **Fix** : règle transverse « toute icône porte un libellé accessible ; toute décoration est `aria-hidden="true"` ».
- **Jour J/accessibilité** — F-18 · Doublon vs inconnu : même rouge, actions opposées (§ EXPERIENCE.md L68) : « DÉJÀ PASSÉ » (ne rien faire) et « DOSSARD INCONNU » (signaler) partagent couleur et format ; sous fatigue, la confusion coûte cher. **Fix** : différencier par icône (↻ vs ⚠) et position, sans toucher à la sémantique danger.
- **Jour J/accessibilité** — F-19 · E-dossard accessible en un geste depuis l'écran verrouillé (§ EXPERIENCE.md L71) : le coureur doit sortir le QR en 1 tap (raccourci/widget iOS, quick settings Android) ; rien de prévu. **Fix** : ajouter au composant E-dossard : raccourci système recommandé + fallback app ; test les gants/mines.

## Reviewer files

- Rubric : `/Users/mouloudhaouili/Desktop/ouidou/Azzel/_bmad-output/planning-artifacts/ux-designs/ux-Azzel-2026-10-20/review-rubric.md`
- Accessibilité : `/Users/mouloudhaouili/Desktop/ouidou/Azzel/_bmad-output/planning-artifacts/ux-designs/ux-Azzel-2026-10-20/review-accessibilite.md`
