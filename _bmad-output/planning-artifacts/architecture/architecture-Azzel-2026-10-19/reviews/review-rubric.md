---
title: "Review rubric — Architecture Spine Azzel"
status: final
created: 2026-10-20
reviewer: review-rubric (good-spine checklist)
inputs:
  - _bmad-output/planning-artifacts/architecture/architecture-Azzel-2026-10-19/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/prds/prd-Azzel-2026-10-19/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Azzel-2026-10-19/addendum.md
méthode: lecture intégrale de la spine + PRD + addendum ; contre-vérification web le 2026-10-20 (registry.npmjs.org pour next/react/react-native/expo/expo-location/@zxing/browser ; supabase.com/pricing pour le free tier)
---

# Review — Architecture Spine Azzel (checklist good-spine)

## Verdict global

**CONFORME AVEC RÉSERVES.** La spine est de qualité : paradigme clair et tenable (« l'appareil propose, le serveur dispose »), six AD réellement applicables, couverture FR-1..27 complète, deferred propre. Deux findings **high** sur l'enveloppe opérationnelle (distribution de l'app coureurs ; mécanisme live pour publics anonymes) et un seed stack partiellement inexact côté Expo (Node, React) sont à traiter avant génération des epics/stories — aucun n'invalide le paradigme.

## Comptage par sévérité

| Sévérité | Nombre |
| --- | --- |
| Critical | 0 |
| High | 2 |
| Medium | 3 |
| Low | 4 |
| **Total** | **9** |

---

## Findings par item de checklist

### Item 1 — Fixe les vrais points de divergence pour epics/stories (dev solo)

**Statut : largement conforme — 1 écart HIGH.**

Bien fixés, sans jargon creux :
- Séparation web PWA / app Expo avec frontières strictes et anti-duplication via `packages/shared` (AD-1, AD-6 ; spine lignes 29-32, 54-57).
- Modèle offline : outbox append-only, lots idempotents, clé `appareil+entité+identifiant naturel`, interdiction CRDT et mutation distante hors sync (AD-2, ligne 37) — neutralise la divergence PWA scan vs app coureurs sur la gestion offline.
- Arbitrage des conflits horaires : premier Passage reçu serveur compte, suivants archivés neutres (AD-3, ligne 42) — fidèle au PRD FR-14.
- Tenancy RLS dès la première table (AD-4), session unique révoquée à l'émission (AD-5).

**F-H1 (high) — Mécanisme « temps réel » pour publics anonymes : ni décidé, ni différé, ni question ouverte.**
FR-16 (résultats live, critère de succès primaire SM-4), FR-19 (carte publique) et FR-24 (tableau admin live) nécessitent tous des mises à jour en continu. La spine mentionne « realtime » comme sous-produit (ligne 69 du diagramme, ligne 137 « PWA scan + module chrono + realtime ») et le budget free tier « realtime 200 conn. » (ligne 97), mais aucune AD ni convention ne fixe **comment un visiteur anonyme consomme du live** : Supabase Realtime avec anon key exposée + policies RLS anon, ou polling REST via le backend Next.js ? Sans décision, les modules `vitrine` et `admin` (deux unités distinctes) peuvent diverger (abonnement vs polling), et le plafond de 200 connexions concurrentes realtime (confirmé sur supabase.com/pricing) risque d'être atteint le jour J avec un public de proches/médias sur les pages publiques. C'est le seul point de divergence majeur manquant au niveau epics/stories.

**F-L3 (low) — Addendum §1 partiellement honoré sur l'email.**
L'addendum demande de documenter « file d'envoi, rejeu en cas d'échec, expiration des jetons, limitation du rythme d'envoi ». La convention Auth (ligne 76) couvre expiration + rate-limit mais pas la file ni le rejeu. Risque de divergence limité car l'envoi se concentre dans `iam` + `shared`, mais l'entrée était une commande explicite de l'input.

### Item 2 — Chaque Rule est applicable et prévient réellement la divergence invoquée

**Statut : conforme.**

- **AD-1** : applicable ; la justification factuelle tient (pas de GPS arrière-plan PWA sur iOS ; Android écran éteint) — la double app n'est pas un gadget.
- **AD-2** : applicable ; la clé d'idempotence est explicite et alignée sur FR-13/14. *Note (non comptée)* : « identifiant naturel » est limpide pour Passage (coureur+checkpoint) mais absent pour Position (pas d'id naturel — ce sera appareil+horodatage/seq) ; la divergence est neutralisée structurellement car le client sync vit dans `shared` (AD-6), une seule implémentation.
- **AD-3** : applicable ; prévient bien la corruption de classement par dérive d'horloge, et assume que l'ordre de réception serveur (pas l'horloge client) tranche — exactement ce que dit FR-14. La distinction « NTP = procédure, pas mécanisme » est saine.
- **AD-4** : applicable ; RLS comme contrainte structurelle, pas de filtrage applicatif seul — prévient réellement la fuite inter-organisations et la réécriture au scaling.
- **AD-5** : applicable ; « appliqué à l'émission, pas côté client » rend la règle testable. Compatible avec FR-7 (e-dossard en cache survit à la révocation de session).
- **AD-6** : applicable ; « une seule version de React/RN par workspace » prévient la dérive — mais voir F-M1 : la stack citée contredit elle-même cette règle.

### Item 3 — Rien sous Deferred ne permet à deux unités de diverger

**Statut : conforme.**

Vérification entrée par entrée (lignes 143-150) :
- **Mécanisme d'auth** : sûr — l'invariant observable (AD-5) et la convention Auth fixent le contrat consommé par web et Expo ; le mécanisme interne est local à `iam`.
- **Bibliothèque cartographie** : locale au module `vitrine`, une seule unité consommatrice.
- **Export rapports** : local au module `admin`.
- **Migration self-host / instance par organisation** : posture, aucun effet inter-unités tant qu'AD-4 tient (correctement conditionné).
- **CI/CD & observabilité** : pour un dev solo V1 avec dry-run opérationnel de couvert (convention Opérations, ligne 79), acceptable.
- **Piège UX iOS « Autoriser une fois »** : détail d'une seule app, renvoyé à `bmad-ux`.

Aucun différé ne cache un contrat inter-unités.

### Item 4 — Technologies nommées vérifiées-current (annonce : vérif web 2026-10-20)

**Statut : écart MEDIUM — la vérification est réelle (Next, zxing, Supabase confirmés) mais inexacte côté écosystème Expo.**

Contre-vérification du 2026-10-20 :

| Entrée spine (lignes 88-98) | Vérifié le 2026-10-20 | Statut |
| --- | --- | --- |
| Next.js 16.4.2 | `next@latest` = 16.4.2 | ✓ exact |
| React (web) 19.2 | `react@latest` = 19.3.1 ; **`react-native@0.88.0` exige `react ^19.3.0`** | ✗ voir F-M1 |
| Node.js ≥ 20.9 | Next 16 : `node >=20.9.0` ✓ ; mais **`expo@58.0.16` : `node ^22.13.0 \|\| ^24.3.0 \|\| ^26 \|\| >=27`** | ✗ voir F-M1 |
| Expo SDK 58 / RN 0.88 | `expo@58.0.16` (SDK 58), `react-native@0.88.0` | ✓ |
| expo-location 58.0.0 | courant : 58.0.18 | ✓ SDK-aligné ; préciser « ~58.0.x » |
| dev build requis (pas Expo Go) | confirmé (modèle dev-client SDK 58) | ✓ |
| pnpm workspaces supportés par Expo | monorepo officiellement documenté | ✓ |
| @zxing/browser 0.2.1 | `@zxing/browser@latest` = 0.2.1 | ✓ exact |
| Supabase free : Postgres 500 Mo · storage 1 Go · realtime 200 conn. · pause 7 j · SMTP custom | supabase.com/pricing : tout confirmé | ✓ exact |

**F-M1 (medium) — Seed incohérent pour le workspace Expo, alors que la spine annonce « vérifié sur le web le 2026-10-20 » (ligne 86).**
Deux inexacteurs concrets : (1) **Node ≥ 20.9** satisfait Next.js mais pas l'outillage Expo 58/RN 0.88 (engines ≥ 22.13) — dans un monorepo à version unique, le floor workspace doit être ≥ 22.13 ; (2) **React 19.2** (web) viole le peer `react ^19.3.0` de RN 0.88.0, donc la règle AD-6 « une seule version de React par workspace » est interne à la stack : 19.2 bloque `apps/runners`, 19.3 s'impose. Erreur détectée à l'install, correction triviale, mais elle falsifie la promesse « vérifié » précisément sur la moitié mobile de la plateforme.

### Item 5 — Couverture FR-1..27 ; carte Capability→Architecture fidèle

**Statut : conforme avec 2 écarts LOW.**

Couverture : les 8 lignes de la carte (lignes 130-141) couvrent FR-1..27 sans trou ni chevauchement, cohérentes avec le phasage PRD (15/11/2026 → dry-run → 26/03/2027). Vérifié FR par FR : chaque FR se retrouve dans exactement une ligne, avec des AD pertinentes.

**F-L1 (low) — Référence fantôme « AD-8 ».**
Ligne 135 : « E-dossard & retrait (FR-7, FR-8) … AD-1, **AD-8**→conv scan, AD-2 ». Le document ne contient que AD-1..AD-6 ; AD-8 n'existe pas. L'intention (renvoi à la convention Scan QR, ligne 78) est reconstituable, mais une référence morte dans la table de gouvernance induit en erreur les stories qui chercheraient la règle.

**F-L2 (low) — FR-19 (carte publique) placée du mauvais côté de la carte.**
Ligne 138 range FR-18..20 sous « apps/runners (expo-location bg) ; module tracking ». Or FR-19 est une capacité **vitrine** (page publique anonyme, tracé GPX) qui consomme les données du module `tracking` ; la ligne « Vitrine (FR-21..23) » (ligne 139) ne la mentionne pas. Fixer le point de consommation évite qu'une story « carte publique » atterrisse dans l'app coureurs.

*Note (non comptée)* : rattacher l'e-dossard au module `chrono` (ligne 135) plutôt qu'`inscriptions` est discutable (l'émission du QR découle de la validation de dossier, FR-5/7) — trancher en story-splitting, pas bloquant.

### Item 6 — Dimensions possédées : décidée / différée / question ouverte (enveloppe opérationnelle scrutée)

**Statut : écart — 1 HIGH, 2 MEDIUM sur l'enveloppe opérationnelle, qui est couverte à moitié.**

Couvert : infra/hébergement **décidé** (VPS IONOS/Hostinger + reverse proxy Coolify, Supabase cloud — lignes 97-98) ; opérations **décidées au minimum viable** (keep-alive hebdo contre la pause 7 j, dry-run pré-course — ligne 79) ; logging minimal orienté audit chrono (ligne 81) ; CI/CD **différé** explicitement (ligne 149).

**F-H2 (high) — Déploiement de l'app coureurs : silence complet (stores, sideload, OTA).**
La spine entre bien dans cette dimension par la petite porte — « dev build requis — pas Expo Go » (ligne 94) — puis s'arrête. Rien sur : publication App Store / Play Store (comptes éditeur Apple ~99 $/an vs contrainte addendum §3 « coût d'exploitation proche de zéro »), délais de revue iOS face à une course datée du 26/03/2027 où ~700 coureurs doivent avoir l'app le jour J (FR-18 Must, SM-6), sideload APK comme alternative Android, stratégie de mise à jour OTA (expo-updates). C'est une dimension « déploiement » que l'altitude possède (elle décide déjà l'hébergement web au même niveau), et son silence est un risque calendataire, pas cosmétique.

**F-M2 (medium) — Environnements (dev / prod) : dimension entière silencieuse.**
Aucun mot sur la stratégie d'environnements : projet Supabase de dev (le free tier en permet 2 — ce serait une décision d'une ligne), données de test vs données réelles d'inscriptions dès le 15/11/2026, secrets/env vars. Pour un dev solo, la tentation « je dev sur la prod » est précisément la divergence que la spine devrait prévenir avant le jalon de novembre.

**F-M3 (medium) — Sauvegardes / DR : silence.**
Le free tier Supabase n'inclut **aucun backup automatique** (confirmé sur la page pricing). Pour une plateforme dont toute la valeur (dossiers, passages, classements) est créée en une journée irréversible, la posture de sauvegarde (dump cron, export post-course, tolérance de perte) est une dimension opérations que la spine ne décide, ne diffère, ni ne questionne. FR-26 (export rapport) n'est pas un substitut de sauvegarde.

### Item 7 — Diagrammes mermaid syntaxiquement valides et porteurs

**Statut : conforme — 1 écart LOW.**

- **Diagramme 1 (graph LR, lignes 59-70)** : syntaxe valide (subgraph, labels avec `<br/>` supportés, cylindres `[(…)]` corrects). Porteur : il matérialise AD-6 (contrat dans `shared`, dépendances web/runners → shared uniquement) et le monolithe backend. *Nit (non compté)* : l'arête `S --> API` se lit « shared appelle le backend » — c'est le client sync défini dans shared qui appelle ; acceptable.
- **Diagramme 2 (erDiagram, lignes 111-126)** : syntaxe valide (cardinalités `||--|{`, `}o--||`, `||--o{` bien formées ; libellés accentués supportés). Porteur : il fixe les frontières d'appartenance (organisation → événement → édition → épreuves/coureurs/secteurs) et croise COUREUR/CHECKPOINT pour PASSAGE, cohérent avec AD-3/AD-4 ; la note sous le diagramme (ligne 128) borne correctement sa portée.

**F-L4 (low) — Cardinalité MISSION–VOLONTAIRE contredit la lecture naturelle d'UJ-2.**
Ligne 119 : `MISSION }o--|| VOLONTAIRE : assignee` impose **exactement un** volontaire par mission. UJ-2 (PRD §2.3) décrit « ravitaillement 2 … 3 scanneurs » et FR-10 dit « y affecter des volontaires » (pluriel). La modélisation défendable est « 3 scanneurs = 3 missions scan sur le secteur », mais l'ambiguïté doit être levée avant les stories, sinon deux lectures du modèle (mission mono-volontaire vs multi-volontaires) divergent entre l'epic missions et l'epic chrono.

---

## Top 3 findings

1. **F-H1 — Mécanisme live pour publics anonymes non tranché** (realtime anon + RLS vs polling ; budget 200 connexions ; modules `vitrine` et `admin` susceptibles de diverger ; porte SM-4/FR-16/FR-19).
2. **F-H2 — Distribution de l'app coureurs silencieuse** (stores/sideload/OTA, délais de revue iOS, comptes éditeur, échéance du 26/03/2027).
3. **F-M1 — Seed stack inexact côté Expo malgré l'annonce « vérifié 2026-10-20 »** (Node ≥ 20.9 < engines Expo 58 ; React 19.2 viole le peer RN 0.88 `^19.3.0` et contredit AD-6).
