---
title: "Réconciliation PRD ↔ Architecture Spine — Azzel"
status: final
created: 2026-10-20
reviewer: bmad (réconciliation automatisée)
inputs:
  - prd: _bmad-output/planning-artifacts/prds/prd-Azzel-2026-10-19/prd.md
  - addendum: _bmad-output/planning-artifacts/prds/prd-Azzel-2026-10-19/addendum.md
  - spine: _bmad-output/planning-artifacts/architecture/architecture-Azzel-2026-10-19/ARCHITECTURE-SPINE.md
---

# Réconciliation PRD ↔ Architecture Spine — Azzel

Méthode : lecture intégrale du PRD (FR-1..FR-27, non-objectifs, périmètre MVP, jalons, critères SM), de l'addendum technique (§1–§3) et de la spine (AD-1..AD-6, conventions, stack, capability map, deferred). Chaque écart est localisé des deux côtés et classé : **[CORRIGER SPINE]** (la spine doit bouger) ou **[ÉCART JUSTIFIÉ]** (silence acceptable, à consigner).

## Synthèse

| # | Écart | Gravité | Localisation PRD/Addendum | Localisation Spine | Verdict |
|---|---|---|---|---|---|
| E1 | Instrumentation des partages absente (FR-16/SM-5/FR-26) | Haute | FR-16 (2e puce), FR-26, SM-5 | Capability map « Chrono & résultats (FR-13..17) » et « Vitrine (FR-21..23) » : aucun mécanisme ; Deferred muet | CORRIGER SPINE |
| E2 | Confidentialité de la carte publique non portée par un invariant (FR-19, RGPD-vie privée) | Haute | FR-19 (dossard seul, aucune info privée, estompage > 1 h) | AD-4 ne couvre que l'isolation inter-organisations ; modules `tracking`/`vitrine` sans règle d'exposition publique | CORRIGER SPINE |
| E3 | Résultats live publics liés à Supabase realtime, plafonné à 200 connexions (SM-4, FR-16, FR-24) | Haute | SM-4, FR-16, FR-24 (audience publique jour J : proches, médias, fédération) | Stack : « realtime 200 conn. » ; Capability map : « module `chrono` + realtime » pour la vitrine | CORRIGER SPINE |
| E4 | Jalon 15/11/2026 et phasage absents de la spine | Moyenne | PRD §0, §6.1 (tableau jalons→FRs) ; Addendum §3 (jalons) | Operations : seul le dry-run est mentionné ; aucun jalon 15/11, aucune conséquence de séquencement | CORRIGER SPINE (légère) |
| E5 | Emails métier et file d'envoi non couverts (addendum §1, FR-6, FR-20) | Moyenne | Addendum §1 (« file d'envoi, rejeu, expiration, limitation ») ; FR-6 (statuts dossier) ; FR-20 (rappel J-7) | Convention « Auth » : code de vérification uniquement (expiration courte, limitation de rythme) ; ni file ni rejeu, ni emails transactionnels hors auth | CORRIGER SPINE (légère) |
| E6 | Budget vitrine < 300 ko / 3G lent cité mais sans règle structurelle | Basse | FR-21 (budget, GPX en chargement différé — hypothèses indexées §9) | Capability map « Vitrine … AD-1 ; budget FR-21 » ; Deferred « bibliothèque cartographie… rendu GPX » | ÉCART JUSTIFIÉ (avec réserve) |
| E7 | Pédagogie batterie absente (FR-20) | Basse | FR-20 (onboarding, rappel J-7, powerbank) ; Addendum §3 (vente powerbanks hors app) | Capability map « Tracking GPS (FR-18..20) → apps/runners » sans détail | ÉCART JUSTIFIÉ |
| E8 | Bus factor = 1 : sobriété/documentation non érigée en contrainte | Basse | Addendum §3 (contrainte portée depuis le brief) | Paradigme/monorepo sobres par construction, mais l'exigence n'est pas écrite | ÉCART JUSTIFIÉ (avec réserve) |

---

## E1 — Instrumentation des partages (FR-16 / SM-5 / FR-26) : silence total de la spine

**PRD.** FR-16, 2e puce : « Les liens de résultats partagés portent un paramètre de suivi anonyme, permettant de compter la portée (SM-5) sans données personnelles. » FR-26 exige que le rapport post-course inclue la « portée des partages ». SM-5 en fait un critère de succès.

**Spine.** La capability map range FR-13..17 dans « PWA scan + module `chrono` + realtime » (gouverné AD-2/AD-3) et FR-21..23 dans `vitrine` ; aucun des deux lignes ne mentionne l'instrumentation des liens ; la table Deferred non plus. Aucune convention (logging « minimal » côté sync uniquement) ne prévoit le comptage de portée.

**Risque.** Décision prise en cours de build (paramètre d'URL + agrégation côté serveur ? table d'événements de visite ?) alors que le PRD l'a explicitement spécifiée et anonyme-par-construction (« sans données personnelles ») — une exigence RGPD-adjacente qui se découvre tard se implémente mal.

**Suggestion [CORRIGER SPINE].** Ajouter une ligne dans Consistency Conventions (ou une demi-AD « Vitrine ») : liens de résultats paramétrés (`?src=…`), comptage agrégé serveur sans donnée personnelle, alimentant le module `admin` (FR-26). Lier FR-16/SM-5 dans le champ Binds de la capability map.

## E2 — Carte publique par dossard uniquement : invariant de confidentialité manquant

**PRD.** FR-19 : « chaque coureur n'y apparaît que par son numéro de dossard — aucune information privée (nom, photo, contact) n'est exposée publiquement » ; positions > 1 h estompées (hypothèse indexée §9). Contrainte RGPD-vie privée explicite.

**Spine.** AD-4 (RLS) protège l'isolation inter-organisations, mais rien ne gouverne l'exposition **au sein** de l'instance vers le public : l'API/realtime qui sert la carte (modules `tracking` + `vitrine`) n'a aucune règle interdisant la fuite d'identité via la surface publique. Le diagramme ER relie `COUREUR ||--o{ POSITION` — la projection publique (dossard, position, fraîcheur) n'est définie nulle part.

**Risque.** Le chemin le plus court pour servir la carte (exposer l'entité Position+Coureur avec RLS « public read ») publie nom/photo/contact — violation directe du PRD et de la vie privée.

**Suggestion [CORRIGER SPINE].** Étendre la spine : soit une règle AD-4-bis (« toute lecture publique passe par une projection dédiée : dossard + dernière position + âge de la donnée ; estompage serveur des positions > X h »), soit une ligne Consistency Convention sous `tracking`/`vitrine`. C'est un invariant structurel (surface API publique), pas un détail d'implémentation.

## E3 — Résultats live publics sur Supabase realtime : 200 connexions vs audience jour J

**PRD.** SM-4 : « Résultats live consultables pendant la course sur la vitrine » ; FR-16 (rafraîchissement continu pour tous les visiteurs) ; FR-24 (tableau live PC). UJ-4 : Malika suit depuis Tizi Ouzou ; §2.1 : proches, médias, fédération.

**Spine.** Stack : « Supabase cloud — free tier … realtime 200 conn. » Capability map : « Chrono & résultats (FR-13..17) … module `chrono` + realtime ». Le monolithe Next.js auto-hébergé est en place (AD-1) mais rien ne dit que le public passe par lui plutôt que par des connexions realtime directes par visiteur.

**Risque.** Le jour J, quelques centaines de visiteurs simultanés sur résultats + carte dépassent le plafond free tier ; échec du critère SM-4 au pire moment. (Le PC course/scanneurs, eux, sont peu nombreux — realtime reste pertinent en interne.)

**Suggestion [CORRIGER SPINE].** Consigner une règle de répartition : realtime (ou polling) réservé aux surfaces internes authentifiées ; la vitrine publique est servie par le backend Next.js (SSE ou polling agrégé, une seule connexion serveur→Supabase), avec la contrainte de cohérence FR-16 (« jamais de classement partiel incohérent ») attachée. À défaut, trancher un plan payant — mais « coût d'exploitation proche de zéro » (addendum §3) plaide pour la répartition.

## E4 — Jalon 15/11/2026 et phasage silencieusement abandonnés

**PRD/Addendum.** PRD §0 et §6.1 : V1 « inscriptions » (FR-1..6 + FR-21 minimale) opérationnelle le **15/11/2026** ; dry-run ensuite ; jour J 26/03/2027. Addendum §3 répète les jalons.

**Spine.** La convention Operations ne mentionne que le dry-run ; le Structural Seed pose d'emblée `apps/web` **et** `apps/runners` sans aucune indication de séquencement. Rien ne contredit le PRD, mais le jalon le plus proche (à ~4 semaines) n'a aucune trace architecturale — ni ce qui doit exister au 15/11, ni ce qui peut attendre.

**Suggestion [CORRIGER SPINE — légère].** Une ligne dans Operations ou une note de phasage : « 15/11/2026 : `apps/web` + modules `inscriptions`/`iam` + vitrine minimale en production ; `apps/runners` et `chrono` hors périmètre du jalon. » C'est de la guidance de build, pas une nouvelle AD — mais une spine qui ignore l'échéance la plus contraignante du projet laisse le développeur solo arbitrer seul.

## E5 — Emails : file d'envoi, rejeu et emails métier non couverts

**PRD/Addendum.** Addendum §1 : « À documenter à l'architecture : file d'envoi, rejeu en cas d'échec, expiration des jetons, limitation du rythme d'envoi. » FR-6 : notification email de chaque changement de statut de dossier ; FR-20 : rappel à J-7.

**Spine.** La convention « Auth » couvre le code de vérification (expiration courte, limitation de rythme) mais ni la file d'envoi ni le rejeu — deux points que l'addendum demandait explicitement — et aucun mot sur les emails transactionnels hors auth (statuts dossier, rappels).

**Suggestion [CORRIGER SPINE — légère].** Élargir la convention : un canal d'envoi unique (file + rejeu) pour tous les emails transactionnels (codes, statuts FR-6, rappel J-7), gouverné par `iam` ou un module `notifications`. Peut rester une convention plutôt qu'une AD, mais le silence contredit une demande écrite de l'addendum.

## E6 — Budget vitrine < 300 ko / 3G lent : couvert par référence, sans règle structurelle

**Spine.** La capability map cite « budget FR-21 » et le Deferred renvoie la bibliothèque cartographie au module `vitrine`. La contrainte est donc liée, pas abandonnée. Réserve : le choix de la carte (deferred) est précisément ce qui peut faire exploser le budget initial ; la spine gagnerait à écrire « la carte et le GPX ne comptent pas dans le premier chargement (chargement différé, PRD FR-21) » pour que la décision deferred soit bornée.

**Verdict [ÉCART JUSTIFIÉ avec réserve]** — suggestion : une phrase dans Deferred « Bibliothèque cartographie … à condition de rester hors du budget initial FR-21 ».

## E7 — Pédagogie batterie (FR-20) : absente, à juste titre

Contenu/UX (onboarding, consignes, rappel J-7, powerbank vendue hors app — addendum §3). La capability map range FR-18..20 dans `apps/runners`. Une spine d'altitude « feature » n'a pas à porter du contenu pédagogique. Seul le rappel J-7 a une composante technique, traitée en E5. **[ÉCART JUSTIFIÉ]**.

## E8 — Bus factor = 1 : sobriété implicite, exigence explicite

L'addendum §3 en fait « une exigence, pas une option ». La spine y répond de fait (monolithe, monorepo sobre, free tier, VPS) mais ne l'énonce pas comme driver. Acceptable à cette altitude ; suggéré : une ligne dans le préambule pour que les choix futurs restent jaugés à cette aune. **[ÉCART JUSTIFIÉ avec réserve]**.

---

## Points de convergence vérifiés (aucun écart)

- **Session unique tous rôles, web + natif confondus** : FR-1 ↔ AD-5, explicite et appliquée à l'émission. ✓
- **Multi-tenancy** : FR-27 ↔ AD-4 (RLS structurelle, `organisation_id` partout, seconde organisation sans changement de schéma). ✓
- **Dédoublonnage cross-appareils « premier reçu compte »** : FR-14 ↔ AD-3, cohérent y compris sur la conservation des passages ultérieurs pour audit. ✓
- **Offline-first outbox idempotente** : addendum §3 / FR-13-14 ↔ AD-2 (clé `appareil+entité+identifiant naturel` ≡ `appareil+checkpoint+coureur`). ✓
- **Forme technique PWA/natif** : décision architecture demandée par l'addendum §3 ↔ AD-1 (PWA volontaires/web, Expo coureurs — motive le GPS arrière-plan). ✓
- **Langue** : PRD §6.2 (français V1) ↔ convention Nommage (« documents et UI en français »). ✓
- **Clôture J-10 / export commande** : addendum §2 / FR-2 / FR-26 ↔ logique produit du module `inscriptions`/`admin`, export Deferred à juste titre sur le format seul. ✓
- **Coût ~zéro / keep-alive / dry-run** : addendum §3 ↔ convention Operations + Stack. ✓

## Conclusion

Trois corrections substantielles (E1 instrumentation partages, E2 confidentialité carte publique, E3 realtime 200 connexions) sont à porter dans la spine avant le workflow UX/epics : les deux premières sont des exigences explicites du PRD tombées en route, la troisième est un mécanisme introduit par la spine qui ne tient pas la charge publique du jour J. E4 et E5 sont des ajouts légers (une ligne chacun) qui réparent des silences sur des demandes écrites de l'addendum et le jalon du 15/11/2026. Le reste est couvert ou justifié.
