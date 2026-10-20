---
title: "Product Brief — Azzel"
status: final
created: 2026-10-19
updated: 2026-10-19
---

# Product Brief : Azzel

## Résumé exécutif

Azzel est une plateforme clé en main de gestion de course de trail, conçue pour fonctionner là où le réseau n'existe pas — les zones blanches de la montagne algérienne. Elle naît d'un besoin réel et immédiat : la 2e édition du trail d'Ait-Aissi (Yakouren, Kabylie), prévue le 26 mars 2027, attend au moins 1 000 coureurs sur deux catégories, organisée par une équipe de jeunes volontaires sans aide externe.

Azzel n'est pas un outil de chronométrage : c'est un **projet sportif-citoyen outillé** dont la réputation est le produit. Quatre thèmes structurels guident chaque décision — sport, santé, citoyenneté, écologie. L'application est la vitrine d'un travail sérieux, destinée à convaincre sponsors, fédération et médias.

Développé en solo avec assistance IA par un bénévole de l'équipe — outil fourni gratuitement à l'organisateur, propriété intellectuelle conservée par son créateur —, le MVP sert d'abord l'édition 2027 ; la plateforme est ensuite **louée par événement** à d'autres organisateurs, qui obtiennent une instance d'Azzel à leur image.

## Le problème

Les organisateurs de trails locaux en Algérie n'ont accès à aucune solution adaptée :

- Les plateformes professionnelles de chronométrage (RFID, tapis, satellite) sont financièrement inaccessibles.
- La 1re édition d'Ait-Aissi a été gérée sur **papier + Excel** : files au retrait des dossards, saisies manuelles, aucun suivi en direct, résultats lents à publier.
- Les zones de course sont sans couverture 3G/4G exploitable — tout outil reposant sur une connexion tombe le jour J.
- Sans vitrine numérique moderne, l'organisation peine à convertir sa réussite terrain (2 chaînes TV nationales, des milliers de vues sur les réseaux dès la 1re édition) en crédibilité durable auprès des sponsors et des institutions.

Le coût du statu quo : un travail bénévole épuisant, des erreurs de pointage et une réputation médiatique non capitalisée.

## La solution

Une plateforme offline-first couvrant tout le cycle de l'événement :

- **Inscriptions en ligne** (2 catégories) avec **décharge de bonne santé** et **règlement intérieur** acceptés, et dépôt de la preuve de paiement CCP ; dossier autoporté — le coureur voit d'un coup d'œil ce qui manque, les organisateurs valident.
- **E-dossard QR** hors-ligne ; dossier validé = dossard prêt, remise express le jour J (zéro papier).
- **Portail volontaires** : découpage de la zone en secteurs, missions claires (ravitaillement, accueil, sécurité routière, ligne d'arrivée, distribution dossards), fiche mission offline dans la poche.
- **Chronométrage par scan QR** aux checkpoints, hors-ligne puis synchronisation par lots ; classements séparés par catégorie, départs échelonnés.
- **Tracking GPS** des coureurs sur carte interactive (positions espacées, pédagogie batterie forte).
- **Vitrine publique** : page course moderne, résultats en direct partageables, mention de l'égide (fédération, ministère des sports), mise en valeur des sponsors — **option A : sponsor unique** (Ifri Algérie visé) ou **option B de repli : plusieurs sponsors plus petits, sans exclusivité**.
- **Portail admin** de pilotage : dossiers, passages, alertes hors-délais, abandons.
- **Rapports chiffrés post-course** : données collectées au fil de l'eau pour le bilan du directoire.

## Ce qui rend Azzel différent

- **Offline-first radical** — conçu dès l'origine pour les zones blanches, pas adapté après coup. Aucune fonction critique ne dépend du réseau.
- **Bâti de l'intérieur, offert à l'organisateur** — le développeur est un bénévole de l'équipe qui fournit l'outil **gratuitement** à l'organisateur (le client) tout en **conservant la propriété intellectuelle** : connaissance intime du terrain, incitation directe à la réussite du 26 mars — aucune fonctionnalité décorative ne survivra à cette date.
- **Coût d'exploitation proche de zéro**, à la portée d'une équipe bénévole.
- **Multi-organisation natif dès le premier schéma de données** (`organisation → événement → édition`) : la location d'instances par événement ne demandera pas de réécriture.
- **Les quatre thèmes sont structurels, pas marketing** : zéro papier (écologie), alertes et pédagogie batterie (santé), volontaires du village et partage du produit (citoyenneté), classements et chrono (sport).

## À qui cela sert

- **L'équipe organisatrice d'Ait-Aissi** — passer de « groupe de jeunes » à une organisation crédible ; piloter 1 000 coureurs sans se noyer.
- **Les volontaires** (~équipe villageoise) — savoir exactement où se placer et quoi faire, même sans réseau.
- **Les coureurs** (1 000+ attendus, longue et courte distance) — s'inscrire simplement, être suivis, vivre une expérience « pro ».
- **Les sponsors** — option A : **sponsor unique** (Ifri Algérie visé, emplacement signature) ou option B de repli : **plusieurs sponsors plus petits, sans exclusivité** ; le sponsoring se contractualise hors de l'application, qui se contente de les mettre en valeur.
- **Fédération, médias, proches** — une course lisible de l'extérieur, résultats vérifiables, carte en direct.

## Critères de succès

Le soir du 27 mars 2027 : félicitations de la fédération, reportages élogieux des TV, forte visibilité sur les réseaux avec de belles images et un sponsor qui renouvelle.

Critères produit `[HYPOTHÈSE — à ajuster]` :
- Retrait de dossard : moins de 5 minutes d'attente par coureur.
- 100 % des scans synchronisés au plus tard le soir de la course ; zéro passage perdu.
- Au moins 80 % des dossiers validés sans échange humain (self-service).
- Résultats live consultables pendant la course ; objectif de partages `[à chiffrer]`.
- MVP opérationnel pour l'ouverture des inscriptions `[HYPOTHÈSE : décembre 2026]`.

## Périmètre

**Dans la V1 (26/03/2027)** — tout le *Must* issu du brainstorming : inscriptions + dossier + preuve CCP, e-dossard QR, portail volontaires (secteurs/missions, offline), chrono scan QR offline avec classements par catégorie et départs échelonnés, vitrine publique (égide + sponsor + résultats live), portail admin (alertes hors-délais), tracking GPS avec pédagogie batterie, rapports chiffrés post-course. Schéma de données multi-organisation posé d'emblée.

**Explicitement hors V1** : gestion du sponsoring et dossier fédération (hors application), passerelle de paiement en ligne (preuve CCP validée humainement), provisioning self-service d'instances, module photos/kit presse (parqués), timeline d'engagement détaillée et historique 1re édition (en *Should*, si le temps le permet).

**Reporté à l'architecture** : choix de la forme technique (PWA / natif / mixte).

## Vision

Si l'édition 2027 tient ses promesses, Azzel devient en 2 à 3 ans **l'outil de référence des trails locaux algériens** : un catalogue d'instances louables par événement, chaque organisateur recevant la même plateforme à son image — mêmes outils, zéro infrastructure lourde. Les données s'enrichissent d'édition en édition (coureurs revenants, historiques), la réputation d'organisation en organisation, et le produit initié par un village devient un bien commun du trail algérien.

## Contraintes et risques assumés

- **Offline-first total** (zones blanches) ; hétérogénéité des smartphones ; économie de batterie (vente de powerbanks le jour J — recette additionnelle).
- **Développement en solo assisté par IA** avec 5 mois de piste : le périmètre *Must* est taillé pour ce budget temps ; tout glissement se paie dans le *Should*.
- **Bus factor = 1** : documentation et sobriété technique obligatoires dès le premier jour `[HYPOTHÈSE : à confirmer comme exigence]`.
- Logistique jour J : stade unique d'Ait-Aissi, ~300 dossards remis en avance / ~700 le jour J en guichets express, ravitaillements acheminés par véhicule avant le départ, secours par volontaires, répétition générale avant le jour J.
