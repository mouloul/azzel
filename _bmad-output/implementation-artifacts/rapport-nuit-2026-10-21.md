# Rapport de nuit — 21 octobre 2026

Boucle autonome `bmad-build-auto` : **5 stories livrées de bout en bout** (spec → implémentation → revue 4 couches → patchs → vérification → commit), épopée 1 sur 9. Rien n'a été poussé (aucun remote configuré).

## Stories livrées

| Story | Commit | Contenu | Tests |
|---|---|---|---|
| 1-1 Fondation monorepo | `59dbcc1` + `91d7f7c` | Monorepo pnpm (web Next 16.4.2, runners Expo 58, shared), tokens Vert Djurdjura source unique, mode sombre anti-flash, enveloppe d'erreur v1, vitest | 22 |
| 1-2 Accès email + code | `2600276` | Module iam : code 6 chiffres (10 min, 5 essais, rate-limit 3/10 min + plafond global, advisory lock), compte créé à la vérification seulement, session unique AD-5 révocable, /connexion UX-DR-19 | 51 |
| 1-3 Formulaire inscription | `2f7c67e` | Module inscriptions : evenement→edition (clôture configurable)→epreuve→coureur, catégorie d'âge dérivée, upsert gardé par statut, /inscription accessible | 100 |
| 1-4 Décharge + règlement | `d93fcd9` | Table document (versions), acceptations atomiques horodatées serveur (versions résolues serveur), CHECKs d'intégrité, /acceptations | 138 |
| 1-5 Preuve CCP | `ba5253c` | Upload image/PDF par magic bytes, compression canvas client ≤ 300 Ko, stockage disque (interface ProofStore), idempotence sha256, remplacement historisé, /preuve avec retry sans re-sélection | 197 |

Chaque spec (`spec-1-*.md`) contient : intent-contract, matrice I/O, journal de triage complet de la revue (verdict par constat), Auto Run Result, risques résiduels. Les 5 specs recommandent une **re-revue de suivi** (`followup_review_recommended: true`) — principalement pour les surfaces UI sans test de composant.

## Comment reviewer ce matin

```bash
bash scripts/dev-db.sh up          # Postgres 17 dédié (conteneur azzel-postgres, port 54329)
pnpm -F @azzel/web db:migrate      # 0001–0005
pnpm test                          # 197 tests verts
pnpm dev:web                       # parcours manuel ci-dessous
```

Parcours manuel recommandé (`pnpm dev:web`, sans SMTP le code s'affiche dans les logs serveur) :
1. `/connexion` : email → code (copier depuis le log) → espace coureur ; bascule sombre ; deuxième connexion = première session déconnectée (AD-5).
2. `/inscription` : formulaire complet → récap ; champ manquant bloquant.
3. `/acceptations` : lire les deux documents, cocher, accepter → récap horodaté.
4. `/preuve` : vraie photo (voir la compression), un PDF, un .txt (refus formats listés), couper le réseau pendant l'envoi → « Réessayer » sans re-sélection.

## Décisions prises en autonomie (à valider)

1. **Auth maison** (pas Supabase Auth) — la convention d'architecture (« code généré en interne ») l'imposait ; sessions en table Postgres.
2. **Code à 6 chiffres** (pas UUID utilisateur) — EXPERIENCE.md l.214 fait foi ; l'UUID de l'archi = identifiant interne de demande.
3. **Postgres 17 local via Docker** (conteneur dédié `azzel-postgres`, port 54329, volume dédié ; le conteneur existant n'a pas été touché). Supabase cloud restera à provisionner (migrations prêtes).
4. **Stockage preuves sur disque** (`STORAGE_DIR`) derrière l'interface `ProofStore` — pas de projet Supabase provisionné ; l'adaptateur viendra derrière la même interface.
5. **Catégories d'âge V1** : U20 / Senior / V1 / V2 / V3 à la date de course (10–100 ans) — décision enregistrée, ajustable sans migration.
6. **Clôture seedée à 23:59:59 heure d'Alger** (2027-03-16T22:59:59Z) — le seed UTC initial glissait au 17 mars.
7. **Migration 0002 amendée** après application initiale (unicité des slugs par parent, FR-27) — base dev réinitialisée, aucun autre environnement.

## À arbitrer / fournir (bloquant ou produit)

- **Clé API Figma en clair dans `.opencode/opencode.json`** — non commitée (gitignorée) mais **à révoquer**.
- **Charte web déposée dans la nuit** (`charte-web-ait-aissi/`) : commitée avec le reste. Ses webfonts (Barlow, Inter) **tranchent avec la règle DESIGN.md « aucune webfont »** — arbitrage nécessaire avant l'épopée 2 (vitrine).
- **Textes juridiques** (décharge, règlement) : seeds provisoires balisés « à remplacer par l'organisateur ».
- `ASSISTANCE_PHONE` : placeholder `+213 555 010 200` à renseigner.
- `SMTP_URL` : à configurer pour l'envoi réel des codes (sans elle, codes dans les logs serveur).
- **Piste d'audit FR-3** : la ré-acceptation écrase l'horodatage (état courant). Si la valeur juridique exige de conserver la trace des versions précédentes, à arbitrer.
- **Brouillon de preuve** : survit à un échec réseau (état React) mais pas à un rechargement — arbitrage UX-DR-20.
- Pas de CI (pas de remote) ; `pnpm test:db` = chemin de vérification déterministe. Suites d'intégration skippées silencieusement sans DATABASE_URL (avertissement console).

## Reste à faire (épopée 1)

- **1-6** Validation/refus organisateur (surface admin minimale + motifs) — dépend de 1-5 ✓
- **1-7** Checklist dossier self-service — lit 1.3/1.4/1.5/1.6
- **1-8** Notifications email (file d'envoi avec rejeu)
- **1-9** Socle multi-organisation : RLS Postgres + test seconde organisation (transversal)
- Reportées (voir `deferred-work.md` + frontmatter `deferred` des specs) : stack de tests de composant UI, durcissement du skip d'intégration, tests de composant ThemeToggle.
