# Scénarios de recette — Épopée 5 : Piloter la course au PC

**Produit :** Azzel · **Périmètre :** stories 5-1 → 5-4 · **Date :** 2026-10-23
**Durée estimée :** 60–80 min (module par module, arrêt/reprise possible)

Chaque module se teste indépendamment. Prérequis : recettes épopées 3 et 4 terminées (volontaire importé, missions scan, annuaire, e-dossard, scanner opérationnel, sync testée).

---

## 0. Préparation de l'environnement (5 min)

```bash
bash scripts/dev-db.sh up        # Postgres 54329
bash scripts/dev-mail.sh up      # Mailpit — http://localhost:8026
pnpm -F @azzel/web db:migrate    # 0001–0029
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web   # http://localhost:3000
```

**Prérequis données (récapitulatif rapide) :**
- [ ] 2–3 coureurs validés, numérotés (`/admin/dossiers` → « Attribuer les dossards »), e-dossards CONSULTÉS (compte coureur → `/espace-coureur/e-dossard`)
- [ ] Un volontaire avec mission **Scan checkpoint** affectée ; missions avec un secteur dont le **contact** est renseigné (`/admin/missions`)
- [ ] QR scannables : e-dossards affichés sur l'écran de l'ordinateur, téléphone volontaire en caméra (recette 4-2 § Astuce)

---

## S1 — Tableau de bord live (story 5-1)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | `/admin/dossiers` → lien « PC course » (ou `/admin/course`) | Cartes : Retraits, Partants (par épreuve), En course, Arrivés, Abandonnés — + « synchronisé il y a X s » TOUJOURS affiché |
| 1.2 | Synchroniser un scan (téléphone volontaire → réseau) | Compteur/board mis à jour en ≤ 5 s SANS rechargement ni saut de défilement |
| 1.3 | Board checkpoint | Lignes triées heure DÉCROISSANTE, dossard à badge mono, heure mono à droite, séparateurs pointillés, lignes non cliquables |
| 1.4 | DevTools → Offline (onglet `/admin/course` ouvert) | Chiffres restent, fraîcheur vieillit (« il y a 42 s »…), point « · reconnexion… » — jamais blanc |
| 1.5 | Repasser Online | Mise à jour reprend automatiquement |
| 1.6 | Sans checkpoint d'arrivée coché | Carte Arrivés : 0 + « aucun checkpoint d'arrivée défini » |
| 1.7 | `/admin/missions` : cocher « Checkpoint d'arrivée » sur une mission scan | Enregistré ; tenter d'en cocher une DEUXIÈME → refus « un seul checkpoint d'arrivée par édition » |
| 1.8 | Deux téléphones scannent le MÊME coureur au MÊME checkpoint, sync des deux | UNE seule ligne sur le board (premier reçu fait foi) |

## S2 — Alertes hors-délais (story 5-2)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Mission scan : « Barrière horaire (facultative) » = maintenant − 5 min ; un coureur RETIRÉ sans passage à ce checkpoint | Bloc danger rouge clignotant (1 flash/s) : « ⚠ Dossard N — pas vu à {checkpoint} depuis {HH:MM} », compteur d'alertes |
| 2.2 | Ligne d'alerte, secteur avec contact | Lien « Appeler le secteur » (`tel:`) ; secteur sans contact → libellé inactif « contact du secteur non renseigné » |
| 2.3 | Synchroniser le PASSAGE du coureur alerté | L'alerte DISPARAÎT au polling suivant |
| 2.4 | Coureur JAMAIS retiré (pas parti) | Jamais alerté |
| 2.5 | Barrière FUTURE (maintenant + 1 h) | Aucune alerte |
| 2.6 | OS en mode « réduire les animations » | Bloc statique — le texte intégral porte seul l'alerte |
| 2.7 | Barrière saisie avant le début de mission | Erreur champ « après le début » |

## S3 — Saisie des abandons (story 5-3)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | Bouton « Saisir un abandon » (en-tête PC course) | Formulaire : dossard, lieu, motif (liste), heure préremplie maintenant |
| 3.2 | Depuis une LIGNE D'ALERTE : « Saisir l'abandon » | Formulaire PRÉ-REMPLI du dossard alerté |
| 3.3 | Saisir l'abandon (lieu + motif + heure) | « Abandon enregistré — dossard N », Abandonnés +1, En course −1, ses alertes disparaissent — sans attendre 5 s |
| 3.4 | Re-saisir le MÊME dossard | Refus clair « déjà abandonné » (premier reçu gagne) |
| 3.5 | Dossard inconnu / jamais retiré / déjà arrivé | Refus clairs distincts (champ/409) |
| 3.6 | Heure dans le futur (+ 3 min) | Erreur champ « ne peut pas être dans le futur » ; heure à maintenant + 1 min : ACCEPTÉE (tolérance horloge) |
| 3.7 | `psql` : `select jeton_coureur, motif, auteur_email from abandon` | Ligne tracée : motif, auteur = email organisateur |

## S4 — Annulation auditable (story 5-4)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | Survoler/focus clavier une ligne de board | Bouton « … » apparaît (aria-label « Annuler le passage — dossard N à {checkpoint} ») |
| 4.2 | Cliquer « … » | Dialogue : « Passage dossard N à {checkpoint} — HH:MM:SS », avertissement « Opération définitive : aucun retour arrière », motif OBLIGATOIRE |
| 4.3 | Confirmer avec motif | « Passage annulé », ligne disparue, compteurs recalculés immédiatement |
| 4.4 | Deux scans du même coureur au même checkpoint (2 appareils) ; annuler le PREMIER | La ligne du SECOND apparaît (ré-arbitrage : il fait foi maintenant) |
| 4.5 | Annuler le SEUL passage d'un coureur à un checkpoint à barrière passée | Coureur redevient « attendu » → son alerte réapparaît |
| 4.6 | Annuler un passage d'ARRIVÉE | Arrivés −1, En course +1 — ET son abandon devient saisissable (plus de « déjà arrivé ») |
| 4.7 | Re-cliquer Confirmer deux fois vite (rejeu curl) | « déjà annulé », aucune seconde ligne, aucune erreur |
| 4.8 | `psql` : `select count(*) from terrain_evenement` avant/après annulations | INTACT (aucune suppression) ; `select * from annulation` : motif + auteur + horodatage tracés |
| 4.9 | Tenter d'annuler un RETRAIT (id d'un retrait via psql, curl) | Refus « Seuls les passages peuvent être annulés » (V1) |

---

## Tableau de synthèse

| Module | Story | Statut | Observations |
|--------|-------|--------|--------------|
| S1 — Tableau de bord live | 5-1 | ☐ ☐ ☐ | |
| S2 — Alertes hors-délais | 5-2 | ☐ ☐ ☐ | |
| S3 — Saisie des abandons | 5-3 | ☐ ☐ ☐ | |
| S4 — Annulation auditable | 5-4 | ☐ ☐ ☐ | |

**Légende :** ☐ à cocher — tests passés / anomalies mineures / bloquantes. Anomalie bloquante : noter le numéro d'étape (ex. « 4.6 : abandon toujours refusé après annulation d'arrivée ») et préserver l'environnement (IndexedDB ET base).
