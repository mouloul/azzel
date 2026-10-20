---
title: "Réconciliation Brief → PRD — Azzel"
status: final
created: 2026-10-19
updated: 2026-10-19
inputs:
  - _bmad-output/planning-artifacts/briefs/brief-Azzel-2026-10-19/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-Azzel-2026-10-19/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-Azzel-2026-10-19/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Azzel-2026-10-19/addendum.md
---

# Réconciliation Brief → PRD : écarts

Objet : vérifier que le PRD et son addendum ne perdent ni ne contredisent aucune idée, contrainte ou décision du brief et de son addendum. Chaque écart est localisé (côté brief et côté PRD) et assorti d'une recommandation : **PRD à modifier** ou **écart justifié (à ignorer)**.

## Synthèse

La réconciliation est globalement bonne : les faits récents sont bien intégrés (décharge de bonne santé et non certificat médical — FR-3 + Glossaire §3 ; sponsors option A/B avec bascule sans dev — FR-22, §2.1 ; session unique tous rôles — FR-1 + addendum PRD §3 ; clôture J-10 avec export commande — FR-2, FR-26 + addendum PRD §2 ; carte publique par numéro de dossard sans info privée — FR-19). Les quatre thèmes (sport, santé, citoyenneté, écologie) et le ton (« interface qui en jette ») figurent en Vision §1, §2.1 et §4.6. Les écarts restants sont surtout des **contraintes structurantes du brief tombées de l'addendum PRD §3** et **une décision de jalon non tracée**.

## Écarts

### E1 — Jalon « inscriptions » : décembre 2026 (brief) vs 15/11/2026 (PRD), décision non tracée

- **Brief** : §Critères de succès — « MVP opérationnel pour l'ouverture des inscriptions `[HYPOTHÈSE : décembre 2026]` » ; addendum brief §5 — « Date d'ouverture des inscriptions (hypothèse : décembre 2026) → **à décider avec l'organisateur** ».
- **PRD** : §0 et addendum PRD §3 — « première version "inscriptions" opérationnelle pour le **15/11/2026** », sans tracé de décision ; la question ouverte « date d'ouverture » a disparu du §8 Questions ouvertes.
- **Analyse** : le PRD avance la date d'un mois et transforme une hypothèse à valider avec l'organisateur en jalon ferme, sans enregistrer qui a décidé ni quand. Risque de planning non validé par le client.
- **Recommandation : PRD à modifier.** Soit documenter la décision (date, auteur, motivation) dans l'addendum PRD §3, soit revenir à « cible 15/11/2026, ouverture des inscriptions décembre 2026 » et réintroduire la question en §8.

### E2 — Bus factor 1 : documentation et sobriété technique absentes du PRD

- **Brief** : §Contraintes et risques — « Bus factor = 1 : documentation et sobriété technique obligatoires dès le premier jour `[HYPOTHÈSE : à confirmer comme exigence]` ».
- **PRD** : aucune occurrence (ni §5 Non-objectifs, ni §6 Périmètre, ni addendum PRD §3 « Rappels de contraintes structurantes »). L'hypothèse « à confirmer comme exigence » n'a été ni confirmée ni infirmée : elle a silencieusement disparu.
- **Analyse** : contrainte structurante majeure pour les choix d'architecture (complexité, dépendances, documentation). C'est exactement le type de rappel que l'addendum PRD §3 est censé porter.
- **Recommandation : PRD à modifier.** Ajouter à l'addendum PRD §3 : « Bus factor = 1 → sobriété technique et documentation obligatoires (exigence, confirmée) » ; à défaut, trancher explicitement et le dire.

### E3 — « Coût d'exploitation proche de zéro » absent du PRD

- **Brief** : §Ce qui rend Azzel différent — « Coût d'exploitation proche de zéro, à la portée d'une équipe bénévole » ; §Vision (zéro infrastructure lourde).
- **PRD** : seul écho indirect « SMTP mutualisé à faible coût » (addendum PRD §1). Aucune contrainte générale de coût d'exploitation dans §5, §6 ou addendum PRD §3.
- **Analyse** : différenciateur et contrainte structurante du brief (équipe bénévole, gratuité de l'outil) qui doit guider hébergement, services tiers et run. Sans elle, l'architecture pourrait retenir des solutions payantes incompatibles avec le modèle.
- **Recommandation : PRD à modifier.** Ajouter la contrainte dans l'addendum PRD §3 (contraintes structurantes pour l'architecture).

### E4 — Vente de powerbanks le jour J (recette + santé) absente du PRD

- **Brief** : §Contraintes et risques — « vente de powerbanks le jour J — recette additionnelle » ; addendum brief §3 — « recette additionnelle et trace GPS vivante (santé) ».
- **PRD** : FR-20 ne mentionne la powerbank que comme **conseil** (« powerbank pour la longue ») ; la vente sur place et sa double rationale (recette / vivifier la trace GPS) n'apparaissent nulle part, pas même en note ou non-objectif.
- **Analyse** : la vente physique elle-même est hors logiciel, mais l'idée conditionne la pédagogie batterie (recommander/mentionner la vente sur place) et disparaît sinon complètement du produit.
- **Recommandation : PRD à modifier (léger).** Une phrase dans FR-20 (« powerbank conseillée ; vente sur place le jour J — voir logistique, addendum brief §3 ») suffit à préserver l'idée sans l'ajouter au périmètre.

### E5 — Égide (fédération / ministère) sans exigence fonctionnelle dédiée

- **Brief** : §La solution — « Vitrine publique : … mention de l'égide (fédération, ministère des sports) » ; addendum brief §2 Must — « vitrine publique (égide fédération/ministère, …) ».
- **PRD** : la mention n'apparaît que dans la **description** de §4.6 ; ni FR-21 (page course), ni FR-22 (sponsors), ni FR-23 (infos pratiques) n'exigent l'affichage de l'égide ni sa configuration par l'admin.
- **Analyse** : item Must du brief réduit à du texte descriptif — rien ne garantit qu'une story l'implémente. Risque de perte en aval (épics/stories ne reprennent que les FR).
- **Recommandation : PRD à modifier.** Ajouter un point à FR-21 (ou FR-23) : « La page affiche l'égide configurée par l'admin (fédération, ministère des sports) ».

### E6 — Synchronisation NTP des téléphones au QG absente des contraintes pour l'architecture

- **Brief** : addendum brief §3 — « synchronisation NTP des téléphones bénévoles au QG avant le départ » (+ check-list téléphones/batteries/impression dossards QR).
- **PRD** : FR-13 repose sur l'« horodatage local » et FR-14 sur la résolution de conflits, mais la prévention amont (dérive d'horloge) n'est rappelée nulle part ; l'addendum PRD §3, censé lister les contraintes structurantes, ne la contient pas.
- **Analyse** : la non-duplication de la logistique jour J (§0 du PRD) justifie l'absence de la check-list, mais la synchronisation horloge conditionne directement l'intégrité des Passages (FR-13/FR-14) — c'est une contrainte produit-technique, pas seulement opérationnelle. UJ-2 (« 3 scanneurs », plusieurs appareils par checkpoint) rend les conflits d'horodatage réels.
- **Recommandation : PRD à modifier.** Ajouter une ligne à l'addendum PRD §3 : « Dérive d'horloge des appareils scanneurs — procédure NTP au QG avant départ (addendum brief §3) ; conséquence : tolérance et résolution des horodatages (FR-13/FR-14) ».

### E7 — Critères de succès « réputation » du brief non repris dans le PRD

- **Brief** : §Critères de succès — « Le soir du 27 mars 2027 : félicitations de la fédération, reportages élogieux des TV, forte visibilité réseaux, sponsor qui renouvelle » ; addendum brief §4.
- **PRD** : §7 ne contient que les critères produit (SM-1 à SM-6 + contre-mesures) ; les critères business/réputation ont disparu.
- **Analyse** : le PRD définit des critères mesurables, ce qui est son rôle ; les critères de réputation sont business et hors de contrôle du produit seul. En revanche, ils justifient SM-5 (partages) et le poids de la vitrine.
- **Recommandation : écart justifié (à ignorer)** — avec option : une ligne de contexte en tête de §7 renvoyant au brief pour la traçabilité.

### E8 — « Guichets multiples avec créneaux » pour le retrait non portés par une FR

- **Brief** : addendum brief §3 — « ~700 le jour J → guichets multiples avec créneaux, remise express ».
- **PRD** : §4.2 description reprend ~300/~700 ; FR-8 couvre le scan de retrait ; aucun point sur les créneaux/lieux de retrait communiqués au coureur (UJ-1 dit seulement « à J-7, il sait où retirer son dossard »).
- **Analyse**** : l'organisation physique des guichets est logistique (non-duplication justifiée), mais l'information du coureur (lieu/créneau de retrait) est produit.
- **Recommandation : PRD à modifier (léger)** — ajouter à FR-23 ou FR-6 : communication du lieu/créneau de retrait au coureur à J-7 ; sinon écart justifié si traité par les contenus éditables.

### E9 — « Zéro papier » (écologie) porté par aucune exigence

- **Brief** : §La solution — e-dossard « remise express le jour J (zéro papier) » ; §Ce qui rend Azzel différent — « zéro papier (écologie) » comme thème structurel.
- **PRD** : le mot « papier » n'apparaît pas ; FR-7/FR-8 couvrent fonctionnellement le flux (QR hors-ligne, scan), donc le zéro papier est réalisé de fait.
- **Recommandation : écart justifié (à ignorer)** — le thème est en Vision §1 et le résultat obtenu par FR-7/FR-8 ; optionally l'ancrer dans FR-8 (« remise sans document papier »).

### E10 — Idées parquées (rapport sponsor auto-généré, multi-édition, emplacement signature avancé) absentes du PRD

- **Brief** : addendum brief §6 (idées parquées) et §2 Could.
- **PRD** : §5 ne parque explicitement que photos/vidéo et kit presse ; le rapport sponsor auto-généré, le multi-édition approfondi et l'emplacement signature avancé ne sont pas cités.
- **Analyse** : le PRD §0 annonce ne pas dupliquer l'addendum brief, qui reste référencé ; les idées restent accessibles.
- **Recommandation : écart justifié (à ignorer)**, sauf si l'on veut un parking unique : les ajouter en note de §5.

## Points vérifiés sans écart (traçabilité)

| Sujet (brief) | Couverture PRD |
|---|---|
| Décharge de bonne santé (pas de certificat) | FR-3 + Glossaire §3 « Décharge » |
| Sponsors option A (Ifri, unique) / B (multiples, sans exclusivité) | §2.1, FR-22 (bascule sans dev) |
| Session unique tous rôles | FR-1 + addendum PRD §3 |
| Clôture J-10, commande médailles/t-shirts, zéro stock | FR-2, FR-26 + addendum PRD §2 |
| Carte publique par numéro de dossard, sans info privée | FR-19 |
| Quatre thèmes structurels (sport, santé, citoyenneté, écologie) | Vision §1 |
| « Interface qui en jette » / vitrine moderne | §2.1 (coureur), §4.6 description |
| Pédagogie batterie forte | FR-20 (+ alerte < 15 % en Should : FR-25 assumption) |
| Offline-first radical, sync par lots idempotente | FR-7, FR-11–FR-14, addendum PRD §3 |
| Multi-organisation dès la V1 | FR-27 + addendum PRD §3 |
| Gratuité de l'outil + PI conservée par le créateur | Vision §1 |
| Portail volontaires : secteurs/missions typées, chargé de communication, fiche offline | FR-9 à FR-12 |
| Won't : sponsoring, dossier fédération, paiement Satim/CIB, provisioning | §5 Non-objectifs |
| Should : timeline d'engagement, historique 1re édition, alerte batterie | §6.1 + NOTE FOR PM FR-23 + §8 Q3 |
| Dry-run avant le jour J | §0 + addendum PRD §3 |
| Contenus pratiques (hébergement, restauration, région) | FR-23 |

## Incohérences internes du PRD relevées au passage

- §2.2 : l'assumption « coureurs sans smartphone ni email — voir Open Questions » renvoie à une question qui **ne figure pas** au §8 (seulement checkpoints, classements, données 1re édition). Ajouter la question ou corriger le renvoi.
