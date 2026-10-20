---
title: "Addendum — Azzel"
status: draft
created: 2026-10-19
updated: 2026-10-19
---

# Addendum au Product Brief Azzel

Niveau de détail conservé pour les documents aval (PRD, architecture). Source : session de brainstorming du 2026-10-19 et rectifications du brief.

## 1. Jobs to be done détaillés

| Acteur | Job |
|---|---|
| **Organisateur** (client) | Passer de « groupe de jeunes » à organisation crédible ; gérer 1 000 coureurs sans se noyer ; bâtir une réputation dans le milieu trail ; à terme, s'étendre à d'autres équipes. |
| **Sponsor** — option A : unique (Ifri Algérie visé) ; option B : plusieurs petits sponsors, sans exclusivité | Renforcer l'image « entreprise du peuple / entreprise locale » soutenant les petites initiatives ambitieuses ; profiter de la présence médiatique. Contractualisation **hors application**. |
| **Coureur** | Inscription simple, interface moderne « qui en jette » ; dossier autoporté (checklist : décharge acceptée, règlement intérieur accepté, preuve CCP déposée) ; contenu progressif à l'approche de la course (parcours, préparation, région, hébergement/restauration). |
| **Volontaire** | Expérience fluide, mission claire par **secteurs** : ravitaillement, accueil des sportifs, sécurité des tronçons routiers, sécurité ligne d'arrivée, coordination de la distribution des dossards… Le scan QR n'est qu'une mission parmi d'autres. Fiche mission offline (secteur, rôle, contact, horaire). |

## 2. Périmètre MoSCoW complet (26/03/2027)

**Must** — inscriptions 2 catégories + décharge + règlement intérieur + preuve CCP ; dossier self-service ; e-dossard QR (zéro papier) ; portail volontaires (secteurs/missions, fiche offline) ; chrono scan QR offline-first, classements séparés, départs échelonnés ; vitrine publique (égide fédération/ministère, sponsors option A ou B, résultats live) ; portail admin + alertes hors-délais ; tracking GPS avec pédagogie batterie ; rapports chiffrés post-course ; schéma `organisation → événement → édition` dès la V1.

**Should** — timeline d'engagement (contenu progressif) ; historique 1re édition (données à récupérer, à vérifier) ; alerte batterie faible (< 15 %).

**Could** — module photos/média (galerie par coureur) ; kit presse pour TVs locales ; emplacements sponsors avancés.

**Won't (pour cette édition)** — gestion du sponsoring ; dossier fédération ; passerelle de paiement en ligne (Satim/CIB écarté : preuve CCP + validation humaine) ; provisioning self-service d'instances.

## 3. Logistique jour J (contraintes opérationnelles)

- Stade unique d'Ait-Aissi : départ, arrivée, village accueil, retrait dossards.
- Retrait dossards échelonné : ~300 en avance (~200 hébergés sur place + ~100 locaux), ~700 le jour J → guichets multiples avec créneaux, remise express (dossier validé en ligne = dossard prêt).
- Ravitaillement acheminé par véhicule adapté avant le départ ; 3 bénévoles scanneurs par checkpoint (pour absorber les files).
- Sécurité et secours : gérés par des volontaires, comme les autres missions (pas de difficulté signalée).
- Chargé de communication : un volontaire dédié (mission du portail).
- Préparation matérielle : check-list téléphones/batteries/impression dossards QR ; **répétition générale (dry-run)** avant le jour J ; synchronisation NTP des téléphones bénévoles au QG avant le départ.
- Vente de **powerbanks** le jour J : recette additionnelle et trace GPS vivante (santé).

## 4. Contexte concurrentiel et preuves

- Statu quo 1re édition : **papier + Excel** — files, saisies manuelles, aucun suivi temps réel.
- Preuve médiatique 1re édition : **2 chaînes TV nationales** (reportages ~5 min), des milliers de vues Facebook/Instagram/TikTok.
- Succès visé soir du 27/03/2027 : félicitations de la fédération, reportages élogieux des TV, forte visibilité sur les réseaux et belles images.

## 5. Décisions ouvertes / à trancher en aval

- **Forme technique (PWA / natif / mixte)** → phase architecture. Contraintes à respecter : offline-first, scan QR caméra, tracking GPS en arrière-plan, hétérogénéité smartphones, batteries.
- **Seuils de succès chiffrés** (proposition : retrait < 5 min ; 100 % des scans synchronisés au soir ; ≥ 80 % des dossiers autovalidés ; partages à chiffrer) → à arrêter au PRD.
- **Date d'ouverture des inscriptions** (hypothèse : décembre 2026) → à décider avec l'organisateur.
- **Hébergement et exploitation** pour la location d'instances par événement → vision ; à documenter en phase architecture.
- **Données de la 1re édition** : existence et format à vérifier auprès de l'équipe.

## 6. Idées parquées (réutilisables)

- Rapport sponsor auto-généré (visibilité, chiffres, retombées).
- Multi-édition approfondi : coureurs revenants, comparatifs inter-éditions.
- Emplacement signature sponsor avancé (au-delà du logo).
