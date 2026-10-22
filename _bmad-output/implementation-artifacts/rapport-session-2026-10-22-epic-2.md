# Rapport de session — 22 octobre : épopée 2 complète

**Épopée 2 « Vitrine publique » livrée (5/5 stories)** + intégration du travail de revue parallèle sur l'épopée 1. Rien poussé.

## Livraisons

| Livrable | Commit | Contenu |
|---|---|---|
| **2-1** Page d'annonce | `5c21191` | Hero photo 2026 (art direction, LCP propre), stats officielles, égide layout, `pnpm budget` (< 300 Ko, en CI), squelettes |
| **2-2** Identité Village | `1f05525` | Piliers (glyphes yaz/tala/tabzimt/ingel), frises + crête, tests contrastes WCAG deux thèmes (violations AA corrigées au passage) |
| **2-3** Sponsors A/B | `00f9d0c` + `6f0c6bf` | Config admin, section vitrine dynamique (bascule sans dev), tokens CSS en fichier généré (budget tenu) |
| Revue épopée 1 (parallèle) | `56ba5d8` | Isolation RLS login_code/session, garde de rôle app stricte, slug événement par org, outbox claim, **CI GitHub Actions** |
| **2-4** Parcours & région | `dcf88ca` | Contenus éditables (FR-23), /parcours + /region dynamiques, GPX différé, citation sourcée, verrou optimiste, XSS https colmaté |
| **2-5** Trailer & témoignages | `2e4d512` | /retour-en-images (poster CSS, chargement au clic), témoignages sobres, dégradations propres, admin dédié |
| **Recette épopée 2** | ce commit | `scenarios-recette-epic-2.md` (règle AGENTS.md) |

**Chiffres :** 733 tests verts + 5 skips opt-in (56 fichiers), budget accueil 306 904/307 200 o, migrations 0001–0015 idempotentes, CI (typecheck + migrate + build + tests + budget).

## Arbitrages à valider

1. **Trailer : lecture au premier clic** (autoplay interdit au chargement, pas au geste utilisateur) — comportement standard des facades ; à valider côté comité.
2. **Galerie 2026 codée** (3 photos) : non éditable — la matière comité attendue (photos, vidéo, témoignages réels).
3. **Accueil dynamique** (lecture DB par requête) depuis 2-3 : le mécanisme du « sans redéploiement » ; le prérendu statique a été abandonné.
4. Budget accueil : **marge ~1,4 Ko** — tout ajout au chemin critique de `/` devra compenser (levier : preload polices).

## Reste à fournir (comité)

- Dates/tarifs/coordonnées 2027, dénivelés/horaires/ravititos exacts (seeds « à confirmer » éditables dans /admin/contenus)
- Vidéo trailer (URL https) + vrais témoignages (/admin/retour-images)
- Logos sponsors réels + option A/B définitive (/admin/sponsors)
- Tracés GPX (URL https par épreuve)

## Suite

Revue humaine (recettes épopées 1 & 2), puis **épopée 3 « Armer les volontaires »** (import Excel, secteurs/missions, fiche mission hors-ligne, annuaire) via le même pipeline.
