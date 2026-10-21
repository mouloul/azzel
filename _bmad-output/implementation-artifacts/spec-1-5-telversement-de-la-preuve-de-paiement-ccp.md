---
title: 'Story 1.5 — Télversement de la preuve de paiement CCP'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: 'd93fcd9'
followup_review_recommended: true
context: []
warnings: []
deferred:
  - summary: >-
      Brouillon de preuve persistant au rechargement (localStorage/IndexedDB) vs état React
    evidence: >-
      UX-DR-20 « brouillon conservé » : la lecture « conservé pour le réessai » est implémentée ; la survie au rechargement est un arbitrage produit ouvert (audit IA).
    location: apps/web/src/app/preuve/preuve-form.tsx
    severity: low
  - summary: >-
      Tests du composant PreuveForm (compression canvas, rejet avant envoi, retry, assistance)
    evidence: >-
      Aucune stack de test de composant dans le dépôt ; regroupé avec les entrées UI existantes.
    location: apps/web/src/app/preuve/preuve-form.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Le dossier ne peut pas avancer : aucune preuve de virement CCP ne peut être déposée depuis un téléphone, sans email ni papier.

**Approach:** Endpoint d'upload côté serveur (validation stricte image/PDF + compression serveur en repli ≤ 300 Ko, stockage disque local configuré par env — adapteur remplacé par Supabase storage quand le projet existera), métadonnées en base (table preuve), UI /preuve avec compression côté client (canvas), rejet des formats non conformes AVANT envoi avec message listant les formats, retry idempotent sans re-sélection (le fichier reste en mémoire), brouillon conservé localement, erreurs doublées du bouton « Appeler l'équipe » (UX-DR-20).

## Boundaries & Constraints

**Always:**
- Formats acceptés : JPEG, PNG, WebP, PDF — tout autre format rejeté côté client ET serveur avec message listant les formats acceptés (jamais de rejet silencieux).
- Compression **côté client** (canvas, cible ≤ 300 Ko) avec feedback visible ; le serveur re-valide (magic bytes + taille finale) et **refuse** au-delà de 300 Ko — la taille fait foi côté serveur.
- Stockage : disque local sous répertoire configurable (`STORAGE_DIR`, défaut `./data/preuves`, gitignoré), nom de fichier aléatoire (UUID, jamais le nom d'origine), métadonnées en base (table preuve : organisation_id, coureur_id, chemin relatif, mime, taille, checksum sha256, horodatage UTC).
- Idempotence du retry : une seule preuve active par coureur (la nouvelle remplace l'ancienne : l'ancienne est marquée remplacée, jamais supprimée — audit) ; le client conserve le fichier sélectionné pour rejouer l'envoi sans re-sélection.
- Prérequis : coureur existant, inscriptions ouvertes, statut « en constitution » (dossier validé = 409).
- Le tutoiement coureur + bouton « Appeler l'équipe » visible dans l'enveloppe d'erreur, la checklist incomplète et l'échec d'upload (SM-C1/UX-DR-11/20) ; horodatages ISO UTC stockés.

**Never:**
- Pas de validation/refus organisateur (story 1.6), pas de notification email (1.8), pas de checklist (1.7).
- Pas d'upload direct vers Supabase (pas de projet provisionné) — l'adapteur disque est le chemin V1 dev, isolé derrière une interface `ProofStore`.
- Pas de traitement d'image exotique (OCR, rotation EXIF avancée) — compression simple dimension/poids.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dépôt image valide | JPEG 2 Mo compressée côté client | Preuve stockée ≤ 300 Ko, métadonnées en base, récap affiché (taille, date) | No error expected |
| Dépôt PDF | PDF 200 Ko | Stocké tel quel (≤ 300 Ko vérifié) | No error expected |
| Format refusé | .txt / .heic | Rejet AVANT envoi (client) avec formats listés ; si forgé côté serveur, rejet serveur | 400 enveloppe `preuve.format` |
| Dépassement après compression | fichier servi > 300 Ko | Refus serveur avec message invitant à recompresser côté client (aucune compression serveur — Design Notes) | 400 enveloppe `preuve.too_large` |
| Échec réseau à l'envoi | connexion perdue | Fichier conservé, bouton « Réessayer » sans re-sélection, erreur doublée de « Appeler l'équipe » | Enveloppe réseau client |
| Nouveau dépôt | preuve existante | Nouvelle preuve active, ancienne marquée remplacée (conservée) | No error expected |
| Dossier validé | statut ≠ en constitution | Refus immuable | 409 enveloppe `inscriptions.dossier_valide` |
| Non inscrit / non connecté | sans coureur / session | 409 no_coureur / 401 | Enveloppes dédiées |

</intent-contract>

## Code Map

- `apps/web/src/modules/inscriptions/` — réutiliser : store (tx, scoping org, gardes clôture/statut via FOR UPDATE), service, errors (+ mapper partagé sharedApiError), migrations runner (0005), patterns routes (cap Content-Length durci — ici la limite est propre : 10 Mo entrant max).
- `apps/web/src/app/acceptations/acceptances-form.tsx` — patterns client : aria-live, focus, router.refresh sur 403/409, AbortSignal.timeout, lien 401.
- `apps/web/src/app/espace-coureur/page.tsx` — ligne d'état preuve (déposée le … / CTA).
- `packages/shared/src/error-envelope.ts` — enveloppe v1.
- Environnement : STORAGE_DIR documenté dans .env.example ; `data/` gitignoré.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/modules/inscriptions/migrations/0005_preuve.sql` -- table preuve (id, organisation_id, coureur_id FK, storage_key, mime, size_bytes, sha256, status 'active'/'replaced', created_at) + index coureur ; intégrer au runner.
- `apps/web/src/modules/inscriptions/proof-store.ts` -- interface ProofStore + LocalDiskProofStore (STORAGE_DIR, écriture atomique tmp→rename, lecture, remplacement = update statut en base + fichier conservé) ; checksum sha256.
- `apps/web/src/modules/inscriptions/proof-service.ts` -- validation (magic bytes JPEG/PNG/WebP/PDF, pas l'extension), compression serveur de repli images (sharp? NON — aucune dep native : ré-encoder via canvas absent côté serveur → repli = refus propre > 300 Ko avec message; PDF non compressible), garde clôture/statut/coureur en transaction, remplacement idempotent.
- `apps/web/src/app/api/inscriptions/preuve/route.ts` + tests routes -- POST multipart (FormData), GET état ; limites : 10 Mo entrant, sortie ≤ 300 Ko garantie ou refus.
- `apps/web/src/app/preuve/page.tsx` + `preuve-form.tsx` -- sélection fichier (accept=.jpg,.jpeg,.png,.webp,.pdf), compression client canvas avec feedback (qualité descendante jusqu'à ≤ 300 Ko, PDFs ≤ 300 Ko acceptés tels quels, sinon message), prévisualisation image, retry sans re-sélection, brouillon conservé (état local), erreurs doublées « Appeler l'équipe », réussite → récap.
- `apps/web/src/app/espace-coureur/page.tsx` -- ligne preuve (déposée le … · taille · remplacable) ou CTA /preuve.
- `apps/web/src/modules/inscriptions/preuve.test.ts` + intégration -- matrice complète : magic bytes (vrais en-têtes fichiers de test), refus formats forgés, remplacement (ancienne 'replaced' conservée), gardes 401/409/403, limite 300 Ko côté stockage, idempotence retry (même checksum → même preuve active sans doublon de ligne active).

**Acceptance Criteria:**
- Given un coureur en constitution et un JPEG valide, when il dépose, then la preuve active en base référence un fichier ≤ 300 Ko sur disque et le récap l'affiche.
- Given un fichier non image/PDF, when la sélection ou l'envoi arrive, then refus avec la liste des formats acceptés et aucun fichier écrit.
- Given un échec réseau, when le coureur réessaie, then l'envoi rejoue le même fichier sans re-sélection et l'erreur affiche « Appeler l'équipe ».
- Given une preuve déjà active, when il en dépose une autre, then la nouvelle devient active et l'ancienne reste en base marquée remplacée.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 23 findings — high 0, medium 4, low 14, false 1, maybe-false 0 (12 entrées patch corrigées, 2 defer, 5 rejets bas)
- findings (résumé) :
  - `[medium]` `[patch]` Idempotence dupliquée à critères divergents service/store (BH3) — alignée sur sha256 seul au store.
  - `[medium]` `[patch]` Fichier orphelin si dédup transactionnelle concurrente (EC3) — best-effort remove du fichier frais.
  - `[medium]` `[patch]` « Le contenu fait foi » non épinglé + mime/filename paramètres morts (VG1+VG-other) — signature simplifiée + tests mensongers (mime PNG pour octets JPEG, JPEG-déclaré-PNG au store).
  - `[medium]` `[patch]` Drift MAX_PROOF_BYTES (TS) vs CHECK SQL (BH7+VG3) — test limite exacte 307 200 / +1 refusé.
  - `[low]` `[patch]` Multipart corrompu non testé (VG2) ; 0 octet → invalid_body (BH6) ; pas de re-compression ≤ 300 Ko (BH4) ; HEIC message dédié (BH5) ; readHeader rejeté (EC1) ; tmp orphelin (EC2) ; franglais (BH12) ; put vérifie detected===format (BH14) ; NoEditionError 503 dédié (EC4) ; crash payload.preuve absent (EC5) ; getPreuveState avalé (BH11) ; assistance branche sans édition (BH17) ; .gitignore /data/ (BH8) ; MAX_UPLOAD 2 Mo + gabarits unifiés { preuve } (BH9+BH16) ; Content-Length mensonger documenté en risque résiduel (BH10).
  - `[false]` `[reject]` BH1 « cul-de-sac fonctionnel » : la surface organisateur EST la story 1.6.
  - `[low]` `[reject]` BH2 quota/débit de remplacements — prérequis coureur authentifié, usage courant sain ; surveillance ops ultérieure. BH13 compression client non testée → defer (stack UI). BH15 formatKiloBytes(0) inatteignable (0 octet rejeté).
  - `[defer]` Brouillon = état React (survit à l'échec réseau, pas au rechargement) — lecture « conservé pour le réessai » implémentée ; persistance navigateur à arbitrer (IA) + tests composant (BH13).

## Auto Run Result

**Statut : done.**

### Changement implémenté
Dépôt de preuve CCP de bout en bout : table preuve (CHECK ≤ 300 Ko, une seule active par coureur via index unique partiel, historique replaced conservé), stockage disque local derrière l'interface ProofStore (STORAGE_DIR, UUID, atomique, anti-traversal, sha256), validation par magic bytes uniquement (formats listés dans le message d'erreur), refus serveur > 300 Ko (aucune compression serveur — décision Design Notes), idempotence par checksum, remplacement transactionnel avec rollback fichier, page /preuve (compression canvas client avec feedback, court-circuit ≤ 300 Ko, prévisualisation, retry sans re-sélection, brouillon en état local, HEIC guidé, erreurs doublées « Appeler l'équipe »), ligne d'état espace coureur, routes durcies (2 Mo entrant, multipart corrompu, 0 octet).

### Revue
4 couches — 23 constats → 12 patchs (4 medium, 8 low) corrigés et re-vérifiés (197/197) ; 2 defer ; 5 rejets bas. Correction éditoriale de la spec : la ligne de matrice « compression serveur de repli » alignée sur la décision « refus » (Bornaires + Design Notes faisaient foi).

**Recommandation de re-revue : true** — 4 medium patchées ; risques nommés : (1) compression canvas et parcours téléphone non testés automatiquement (Node) — parcours manuel indispensable, (2) Content-Length mensonger : formData bufferise avant rejet (2 Mo max désormais — défense en profondeur, pas absolue), (3) budget storage 1 Go non comptabilisé (pas de plafond agrégé — reporting à prévoir avec la story admin), (4) .gitignore étendu à apps/web/data/ (justifié : le serveur dev y écrit).

### Vérification
- `db:migrate` 0001–0005 idempotent ✓ ; `pnpm test` 197/197 ✓ ; `pnpm build` + `pnpm typecheck` ✓
- Smoke E2E réel du subagent sur serveur dev (dépôt/remplacement/idempotence/refus formats et tailles/401) puis nettoyage.

### Risques résiduels
- Numéro d'assistance placeholder (ASSISTANCE_PHONE) — à renseigner.
- Persistance navigateur du brouillon non implémentée (arbitrage produit).
- Adaptateur Supabase storage à écrire quand le projet sera provisionné (interface prête).

## Spec Change Log

## Review Triage Log

## Design Notes

Sans dépendance native de traitement d'image (bus factor 1, sobriété) : la compression vit côté client (canvas), le serveur valide par magic bytes + taille finale et refuse au-delà de 300 Ko — le client est « l'appareil photo », le serveur est le douanier. sharp écarté volontairement (build natif) ; si un jour la compression serveur s'impose, l'interface ProofStore laisse la place. Storage disque local : posture auto-hébergée cohérente (VPS + volume), STORAGE_DIR configurable — la migration vers Supabase storage sera un adapteur derrière la même interface.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0005 appliquées, idempotent.
- `pnpm test` -- expected: suite verte, matrice preuve couverte (intégration + routes + unitaires magic bytes/checksum).
- `pnpm build && pnpm typecheck` -- expected: tout vert.

**Manual checks (if no CLI):**
- `pnpm dev:web` → déposer une vraie photo (voir la compression client affichée), un PDF, un .txt (refus), couper le réseau pendant l'envoi (retry sans re-sélection), déposer deux fois (remplacement) ; vérifier data/preuves/ et la ligne en base.
