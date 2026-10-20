# Revue Accessibilité — Azzel

## Verdict global

Le socle est solide : sur 38 paires hex calculées (structure, opérationnelles, composants mixtes, deux modes), 37 passent WCAG AA avec marge, et l'intention accessibilité (bip + texte, cibles 48 dp, plancher 15 px, reduced-motion, assistance humaine) est réellement écrite dans les spines. Les défaillances restantes sont de spécification, pas d'intention : une paire WCAG en échec (bouton lecture vidéo), deux canons jour J non chiffrés (fréquence du clignotement, dimensions du voyant), une contradiction interne (meta 12 px vs plancher 15 px), et un SM-C1 déclaré composant mais jamais placé dans les flux/états d'erreur. Tout est corrigeable dans les documents avant moindre ligne de code.

## Findings

### 1. Contrastes (paires hex, deux modes)

**F-01 [high] — Bouton lecture vidéo illisible sur son propre bloc sombre.**
`bloc-video` = dégradé `#1B281F → #101A14` avec `playButton: '{colors.action}'` = `#345E4A` (DESIGN.md, frontmatter L151-154 et Components L256).
Ratios calculés : **2,08:1** (sur `#1B281F`) et **2,41:1** (sur `#101A14`) — sous le seuil 3:1 UI de WCAG 1.4.11. Le composant est en outre figé en couleur clair, sans variante sombre.
Fix : bouton en `{colors.action-sombre}` `#8FD4A8` (**8,87:1**) ou blanc plein sur les deux modes ; ajouter la paire play/bloc au frontmatter comme paire testée.

**F-02 [medium] — Voile d'overlay caméra à 93 % : contraste non garanti.**
« voiles d'overlay caméra = surface à 93 % » (DESIGN.md L196, L245) : badges « · LIVE », heure, overlay dossard reposent sur un voile semi-transparent au-dessus du flux caméra — le contraste réel varie avec la scène filmée (plein soleil → voile écrasé).
Fix : fond quasi opaque (≥ 96 %) derrière tout texte du pied de cadre, ou texte sur pastille pleine ; ajouter la règle au composant Caméra scan.

**F-03 [low] — Séparation tonale cartes/fond très faible (1,10:1 / 1,16:1).**
Surface `#FAFCF8` sur fond `#EDF2EB` = **1,10:1** ; sombre **1,16:1** ; filet encre 16 % ≈ `#D6DAD5` = **1,37:1** (DESIGN.md L181, L196, L242). Pas un échec WCAG strict (la carte n'est pas le seul porteur d'information), mais sous soleil la structure de page se dissout.
Fix : filet à 25–30 % d'opacité ou fond légèrement assombri ; à trancher avec le registre « pas d'ombre ».

Toutes les autres paires passent avec marge : texte/bg 13,66:1 ; texte-2/bg 5,85:1 ; bouton 6,81:1 ; opérationnelles claires 5,40–6,70:1 ; structure sombre 7,91–15,32:1 ; opérationnelles sombres 6,62–8,34:1 ; QR 15,51:1 ; avatar alternance 6,13:1 ; indicateurs non-texte (puces, témoins, bordures) 4,76–10,30:1 ≥ 3:1.

### 2. Jamais la couleur seule / photosensibilité

**F-04 [high] — « Lampe clignotante » du voyant danger sans fréquence spécifiée.**
DESIGN.md L246 (voyant scan danger : « + lampe clignotante »), EXPERIENCE.md L68. WCAG 2.3.1 exige ≤ 3 flashs/s ; rien ne borne la fréquence, et c'est un composant jour J manipulé par 150–200 volontaires.
Fix : spécifier clignotement ~1 Hz (période ≥ 1 s) par alternance on/off, jamais de stroboscope ; même borne pour l'alerte hors-délais (déjà « lent, ~1,1 s » DESIGN.md L253 — conforme, à généraliser en règle).

**F-05 [medium] — Le bip audio a trois points de défaillance non couverts.**
Le bip est un canal principal de confirmation (EXPERIENCE.md L67, L113, L127, L153) mais : (a) politique autoplay navigateur — un `AudioContext` non débloqué par geste utilisateur reste muet, et le scan n'a pas de tap après lancement ; (b) téléphone en silencieux/volume bas ; (c) bruit du ravitaillement (1000 coureurs). Aucun canal haptique prévu.
Fix : débloquer l'audio au tap « Démarrer le scan » ; ajouter la vibration (Vibration API / haptique natif) comme troisième canal ; bip distinct doublon vs inconnu (deux mélodies, pas deux volumes).

Points forts du thème : voyants systématiquement doublés du texte intégral (« DÉJÀ PASSÉ » ≠ « DOSSARD INCONNU »), alertes avec libellé complet, checklist à double encodage (puce + lien action), sync à icône + texte.

### 3. Lisibilité terrain

**F-06 [high] — `meta` à 12 px contredit le plancher « jamais < 15 px critiques ».**
`typography.meta` = 12 px (DESIGN.md L69-71) est affectée aux heures de passage, bandeau e-dossard, fraîcheur (L207) — données chrono/audit critiques jour J — tandis que L206 et EXPERIENCE.md L125 posent « jamais < 15 px pour les contenus critiques ».
Fix : soit monter les occurrences critiques de meta à 14–15 px mono, soit lister explicitement lesquelles restent 12 px (légendes galerie, notes) et passer heures/fraîcheur/bandeau au-dessus du plancher.

**F-07 [medium] — Voyant scan « géant » sans dimension chiffrée.**
« pill géante lisible à bout de bras » (DESIGN.md L246) : aucune taille de texte, hauteur de pill, ni graisse spécifiée. C'est le composant n°1 du jour J, lu en plein soleil à 50 cm par un volontaire pressé.
Fix : chiffrer dans la spec — texte ≥ 24 px / graisse 800, heure mono ≥ 16 px, pill ≥ 96 px de haut, plein cadre ; graisse ≥ 700 partout sur ce composant.

**F-08 [medium] — Zoom pincer/navigateur non garanti.**
Aucune mention interdisant `user-scalable=no` / viewport zoomé ; coureurs presbytes mal servis sinon (EXPERIENCE.md Accessibility Floor L120-130 muet sur le sujet).
Fix : ajouter au floor : zoom navigateur 200 % testé, pinch-zoom jamais désactivé, textes sans troncature à 200 %.

Points forts du thème : cibles ≥ 48 dp/44 pt explicites (L115), corps courant 15 px × 1,7, dossard 74 px, « tap d'abord » sans dépendance au survol, QR sur carte blanche quel que soit le mode.

### 4. SM-C1 — assistance humaine visible

**F-09 [high] — Bouton assistance déclaré mais jamais placé dans les flux ni les états d'erreur.**
EXPERIENCE.md L88 le limite à « Espace coureur, app, PWA ». Or : (a) UJ-1 (L186-202) ne le mentionne à aucune étape — inscription, formulaire, télversement CCP ; (b) l'état « Erreur API » (L100) promet « message homogène + action à faire » sans exiger le numéro humain ; (c) l'email de refus de dossier (L89) remonterait le motif sans canal d'appel ; (d) la vitrine publique (Malika, fédération) n'a pas de contact spécifié en bouton.
Fix : faire du « Appeler l'équipe : +213 … » un élément obligatoire de l'enveloppe d'erreur, de l'email de refus, de la checklist incomplète et des infos pratiques vitrine ; l'inscrire comme étape d'échec dans UJ-1.

**F-10 [medium] — « DOSSARD INCONNU — signaler au PC » : l'action est nommée, pas actionnable.**
Le voyant rouge dit « signaler au PC » (EXPERIENCE.md L68, L213) mais n'offre pas l'appel direct ; le contact PC cliquable vit dans la fiche mission (DESIGN.md L249) — à deux écrans de là, sous stress.
Fix : bouton appel direct sur l'écran d'erreur inconnu (et sur le doublon en variante silencieuse).

### 5. Lecteur d'écran

**F-11 [medium] — Annonce du scan sans mécanisme spécifié.**
« le scan annonce "Passage enregistré" à la transition » (EXPERIENCE.md L127) : pas de live region, pas d'annonce du doublon avec l'heure du 1er passage, ni de l'état caméra au lancement.
Fix : `role="status"` / `aria-live="assertive"` sur le voyant ; annonces distinctes succès / doublon (+ heure du 1er passage) / inconnu ; état « caméra active / annuaire chargé » annoncé au démarrage.

**F-12 [medium] — Focus visible non spécifié.**
« Ordre de focus = ordre de lecture » (EXPERIENCE.md L130) couvre l'ordre, jamais la visibilité — indispensable pour l'admin au clavier (PC course) et tout utilisateur clavier.
Fix : ajouter au floor : focus visible 2 px `{colors.action}` / `{colors.action-sombre}` selon mode, offset 2 px, `outline` jamais supprimé.

**F-13 [low] — Libellés d'icônes non généralisés.**
✓, ◷, « · LIVE », avatar initiales, bouton play : aucun `aria-label` exigé ; la frise kabyle est déclarée décorative (« jamais porteuse d'information », DESIGN.md L260) mais sans `aria-hidden` explicite.
Fix : règle transverse « toute icône porte un libellé accessible ; toute décoration est `aria-hidden="true"` ».

### 6. Saisie et formulaires

**F-14 [medium] — Code à 6 chiffres : pattern de saisie non spécifié.**
UJ-1 étape 2 « email + code à 6 chiffres » (EXPERIENCE.md L193). Les OTP à cases séparées sont un piège classique (collage, autofill, lecteur d'écran).
Fix : champ unique `inputmode="numeric"` `autocomplete="one-time-code"`, collage autorisé, durée de validité affichée, renvoi du code possible avec compte à rebours.

**F-15 [medium] — Télversement CCP : l'échec réseau n'a pas de traitement.**
Feedback de compression/envoi prévu (EXPERIENCE.md L105), mais l'espace coureur est en ligne uniquement (L43) : que se passe-t-il si l'envoi échoue en 3G ? Ni reprise, ni conservation du fichier, ni assistance.
Fix : retry idempotent sans re-sélectionner le fichier, brouillon conservé localement, message d'erreur doublé du bouton « Appeler l'équipe » (rejoint F-09).

Points forts du thème : enveloppe d'erreur unique « jamais de code brut », refus toujours motivé remontant au coureur, microcopy actionnable sans punition (« Jamais comme punition », ton sans exclamation).

### 7. Mode sombre

**F-16 [medium] — Bascule disponible mais défaut, placement et mémorisation non spécifiés.**
« Mode sombre optionnel partout, basculable » (EXPERIENCE.md L25, L181 ; DESIGN.md L170) : aucun composant toggle, aucun placement, pas de `prefers-color-scheme`, pas de choix mémorisé. Départ 06:00 (UJ-2 L209) : une PWA qui s'ouvre en clair à l'aube éblouit et attire l'œil.
Fix : défaut = préférence système + override mémorisé ; toggle visible dans l'en-tête de chaque surface ; PWA volontaires : proposer le sombre à la première ouverture la veille (checklist de préparation).

Points forts du thème : opérationnelles correctement inversées (encres sombres dédiées, toutes AA 6,6–8,3:1), e-dossard nativement sombre (bon pour l'aube), « ne pas tester les opérationnelles en sombre » listé comme don't.

### 8. Ce que la liste oublie (jour J, stress, fatigue, environnement)

**F-17 [medium] — Mains mouillées / boue : espacement des cibles non spécifié.**
48 dp ok, gestes cachés bannis (EXPERIENCE.md L118), mais rien sur l'espacement entre cibles adjacentes ni sur les actions en bord d'écran (fausses touches du pouce, gants).
Fix : gap ≥ 8 px entre cibles interactives ; aucune action critique collée au bord ; bouton pause/stop du scan ≥ 64 dp.

**F-18 [low] — Doublon vs inconnu : même rouge, actions opposées, volontaire à 06:00 sous stress.**
« DÉJÀ PASSÉ » (ne rien faire) et « DOSSARD INCONNU » (signaler) partagent la couleur danger et le format (EXPERIENCE.md L68). Le texte les distingue, mais sous fatigue la confusion action/ne-pas-faire coûte cher.
Fix : différencier par icône (ex. ↻ vs ⚠) et position (doublon = laisser passer rapidement), sans toucher à la sémantique danger.

**F-19 [low] — E-dossard accessible en un geste depuis l'écran verrouillé.**
Aube, mains occupées, batterie : le coureur doit sortir le QR en 1 tap (raccourci/widget iOS, quick settings Android) ; rien dans EXPERIENCE.md L71 ou UJ-1.
Fix : ajouter au composant E-dossard : raccourci système recommandé + fallback app ; test les gants/mines.

## Points forts

- **Palette mathématiquement saine** : 37/38 paires AA avec marge réelle (minimum 5,40:1 sur une paire texte), y compris encres blanches sur opérationnelles — rare dans un design system du premier coup ; encres sombres dédiées plutôt que blanc plaqué.
- **Jamais la couleur seul, structurellement** : bip + texte intégral sur voyants, alertes clignotantes avec libellé complet, sync icône + compteur, checklist double-encodage, `prefers-reduced-motion` cité trois fois avec liste exhaustive des animations.
- **SM-C1 présent dans l'intention** : exigence citée verbatim, bouton assistance « jamais réduit à une icône, jamais enfoui », microcopy « Appelle l'équipe », refus jamais silencieux — il ne manque que le placement systématique (F-09).
- **Lisibilité terrain pensée** : plancher 15 px, corps 1,7, mono pour heures/dossards (chiffres stables), cibles ≥ 48/44, « tap d'abord », QR sur blanc garanti, dossard 74 px.
- **Offline sans angoisse** : « HORS-LIGNE PRÊT », outbox visible, fraîcheur affichée, aucune punition (permission refusée, doublons neutres) — excellent pour utilisateurs peu à l'aise.
- **Contraintes réelles intégrées** : budget 300 Ko, Android entrée de gamme, fallback iOS, examens des deux modes exigés dans les Don'ts.

---

*Calculs : ratios WCAG 2.x (relative luminance / seuils 4,5:1 texte, 3:1 grands textes et composants UI) sur les 38 paires déclarées ou induites par les composants. Source : frontmatter DESIGN.md L7-43 + composants L94-165.*
