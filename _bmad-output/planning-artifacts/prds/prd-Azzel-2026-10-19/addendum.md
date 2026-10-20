---
title: "Addendum — PRD Azzel"
status: final
created: 2026-10-19
updated: 2026-10-19
---

# Addendum au PRD Azzel

Décisions de mécanisme et points techniques pour l'architecture. Ne duplique pas l'addendum du brief (JTBD détaillés, MoSCoW complet, logistique jour J — voir `_bmad-output/planning-artifacts/briefs/brief-Azzel-2026-10-19/addendum.md`).

## 1. Envoi des emails et codes de vérification

- La vérification email est **gérée en interne** : l'application génère un **jeton unique par tentative** (type UUID) et l'envoie elle-même par email.
- Transport : **SMTP mutualisé à faible coût** (fournisseur au choix de l'architecture ; contrainte : délivrabilité vers les boîtes algériennes et internationales, coût marginal).
- À documenter à l'architecture : file d'envoi, rejeu en cas d'échec, expiration des jetons, limitation du rythme d'envoi.

## 2. Clôture des inscriptions et commandes (J-10)

- Fermeture des inscriptions à **J-10 (16/03/2027)**.
- Motif opérationnel : commande des **médailles** et **t-shirts** sur les décomptes de dossiers **validés** (zéro stock dormant).
- Conséquence produit : export « commande » à J-10 (FR-26) ; le champ taille de t-shirt est requis (FR-2).

## 3. Rappels de contraintes structurantes pour l'architecture

- **Offline-first** : scan, fiche mission, annuaire des coureurs, e-dossard, positions GPS — tout fonctionne sans réseau, sync par lots idempotente.
- **Session unique par compte** (aucun multi-appareil simultané) — couvre tous les rôles.
- **Forme technique (PWA / natif / mixte)** : décision explicite de l'architecture ; contraintes : caméra QR rapide sur Android d'entrée de gamme, GPS en arrière-plan, cache persistant, vitrine publique légère.
- **Schéma `organisation → événement → édition`** dès la V1 (préparation de la location d'instances).
- **Bus factor = 1** : documentation technique et sobriété sont des exigences, pas des options (contrainte portée depuis le brief).
- **Coût d'exploitation proche de zéro** : hébergement et SMTP dimensionnés pour une équipe bénévole.
- **Vente de powerbanks le jour J** : recette opérationnelle hors application, en appui de la pédagogie batterie (FR-20).
- **Jalons** : V1 « inscriptions » opérationnelle le **15/11/2026** ; répétition générale (dry-run) avant le jour J.
