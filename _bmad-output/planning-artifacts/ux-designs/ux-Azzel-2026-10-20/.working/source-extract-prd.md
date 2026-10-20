# Extraction UX — Sources PRD (Azzel)

Sources : `prd.md` et `addendum.md` dans `_bmad-output/planning-artifacts/prds/prd-Azzel-2026-10-19/`.
Document de travail pour la session de design UX du 2026-10-20. Capture brute, rien d'inventé.

---

## Vision produit (problème, proposition de valeur)

*Source : prd.md §1, §0*

- **Problème** : l'équipe de jeunes volontaires d'Ait-Aissi (Yakouren, Kabylie) organise le trail avec « le papier et Excel » ; besoin d'une organisation « moderne, crédible et sûre » pour 1 000 coureurs sur deux épreuves (2e édition : **26 mars 2027**, ≥ 1 000 coureurs, 150–200 volontaires).
- **Proposition de valeur** : « plateforme clé en main de gestion de course de trail, conçue pour fonctionner là où le réseau n'existe pas — les zones blanches de la montagne algérienne ».
- Azzel n'est **pas un outil de chronométrage** : « un projet sportif-citoyen outillé dont la réputation est le produit ».
- Quatre thèmes structurels guident chaque décision : **sport, santé, citoyenneté, écologie**.
- La vitrine publique (résultats en direct, égide, sponsors) « convertit la réussite terrain en crédibilité durable auprès de la fédération, des médias et des sponsors ».
- Outil fourni gratuitement à l'organisateur ; schéma `organisation → événement → édition` posé dès la V1 pour la location d'instances post-2027.
- Jalons : V1 « inscriptions » opérationnelle le **15/11/2026** ; dry-run avant le jour J.

## Utilisateurs / personas (verbatim, noms cités)

*Source : prd.md §2.1, §2.2, §2.3*

Rôles :
- **Organisateur (client)** — Nadia (persona UJ-3, organisatrice au PC course)
- **Coureur** — Yacine (persona UJ-1 : « 28 ans, coureur à Alger »)
- **Volontaire** — Karim (persona UJ-2 : « 19 ans, volontaire du village », scanneur au ravitaillement 2)
- **Proches / médias / fédération** — Malika (persona UJ-4 : suit son frère depuis Tizi Ouzou)
- **Sponsor** — « Ifri visé » (option A unique) ou option B multiples sans exclusivité ; sponsoring contractualisé hors application
- **Directoire** — organe collégial, destinataire du rapport post-course
- Non-utilisateurs V1 : autres organisateurs ; « coureurs sans smartphone ni email » (inscription sur place non traitée — Question ouverte n° 4).

## Besoins et jobs-to-be-done

*Source : prd.md §2.1*

- **Organisateur** : « piloter tout l'événement de manière centralisée sans infrastructure lourde ; passer de "groupe de jeunes" à organisation crédible ».
- **Coureur** : « s'inscrire simplement avec une interface qui en jette ; savoir d'un coup d'œil où en est son dossier ; être chronométré et suivi en sécurité ».
- **Volontaire** : « savoir exactement où se placer et quoi faire le jour J, même sans réseau ; scanner vite et juste ».
- **Sponsor** : « être visible sur une vitrine médiatique ».
- **Proches, médias, fédération** : « suivre la course de l'extérieur — carte, passages, résultats ».

## Épopées / fonctionnalités / écrans mentionnés (noms verbatim)

*Source : prd.md §4*

- **4.1 Inscription et dossier coureur** — FR-1 Inscription par email vérifié (session unique) ; FR-2 Formulaire d'inscription à l'édition (épreuve longue ~35 km / moyenne 10–15 km, taille de t-shirt requise, clôture J-10) ; FR-3 Acceptation décharge et règlement intérieur (horodaté avec version) ; FR-4 Télversement preuve de paiement CCP (validation/refus avec motif) ; FR-5 Checklist de dossier self-service (« chaque pièce manquante nomme l'action à faire ») ; FR-6 Notifications de statut par email.
- **4.2 E-dossard et retrait** — FR-7 E-dossard QR hors-ligne (haute définition, lisible après 30 jours de cache) ; FR-8 Scan de retrait du dossard (voyant doublon ; ~300 retraits en avance, ~700 le jour J).
- **4.3 Portail volontaires et missions** — FR-9 Import Excel volontaires (rapport ligne par ligne) ; FR-10 Secteurs et missions (types : scan checkpoint, accueil, sécurité tronçon, sécurité arrivée, distribution dossards, communication ; état couverte/vacante ; avertissement chevauchement) ; FR-11 Fiche mission hors-ligne (secteur, rôle, horaires, contacts, consignes) ; FR-12 Préchargement annuaire des coureurs.
- **4.4 Chronométrage et résultats** — FR-13 Scan de passage offline (confirmation < 1 s, bip + voyant ; doublon = voyant rouge) ; FR-14 Sync par lots (message « 217 passages en attente → envoyés ») ; FR-15 Classements et départs échelonnés (scratch ; par sexe/catégories d'âge à confirmer) ; FR-16 Résultats en direct (URLs partageables, paramètre de suivi anonyme) ; FR-17 Abandons (coureur, lieu, motif, heure).
- **4.5 Tracking GPS** — FR-18 Capture et envoi des positions (opt-in, 5–10 min, « précision équilibrée ») ; FR-19 Carte interactive publique (coureurs = numéro de dossard uniquement, tracé GPX + checkpoints, positions > 1 h estompées) ; FR-20 Pédagogie batterie (charge 100 %, tueur d'applications, powerbank, rappel J-7).
- **4.6 Vitrine publique** — FR-21 Page course publique (dates, épreuves, parcours GPX, dénivelés, horaires, ravitaillements, consignes de sécurité, sans compte ; mention « sous l'égide de la fédération et du ministère des sports ») ; FR-22 Bloc sponsors (option A emplacement signature / option B multiples, bascule sans dev) ; FR-23 Infos pratiques et annexes (hébergement, restauration, région, exhibitions sportives).
- **4.7 Portail admin et PC course** — FR-24 Tableau de bord live (retraits, partants, en course, arrivés, abandonnés, passages par checkpoint ; fraîcheur = dernière sync) ; FR-25 Alertes hors-délais (barrière horaire ; batterie < 15 % Should) ; FR-26 Rapports chiffrés post-course + export « commande » à J-10.
- **4.8 Socle multi-organisation** — FR-27 Isolation des données par instance.

Écrans/interfaces implicites : vitrine publique (page course, carte, résultats live), espace coureur (checklist, e-dossard, activation tracking), app volontaire (fiche mission, caméra scan plein écran), portail admin (tableau live, gestion dossiers, secteurs/missions, exports).

## Parcours utilisateurs décrits

*Source : prd.md §2.3 — UJ-1 à UJ-4, verbatim condensé*

- **UJ-1. Yacine s'inscrit à la longue et boucle son dossier seul.** Découverte via vitrine partagée sur Instagram → inscription email → code par mail → formulaire → télversement preuve CCP. Point culminant : checklist au vert « Dossier validé — dossard prêt », e-dossard QR disponible hors-ligne. À J-7, il sait où retirer son dossard. *(Réalise FR-1 à FR-7)*
- **UJ-2. Karim scanne en zone blanche toute la matinée.** Invitation (import Excel) → définit mot de passe → découvre mission (ravitaillement 2, secteur Djurdjura-ouest, 3 scanneurs). La veille : fiche mission hors-ligne dans son téléphone. Jour J sans réseau : « caméra plein écran, bip vert par coureur, voyant rouge sur doublon ou inconnu ». À 14 h en apercevant du réseau : « 217 passages en attente → envoyés ». *(Réalise FR-8 à FR-14)*
- **UJ-3. Nadia pilote la course au PC.** Matin : tableau live (retraits, partants par épreuve). Midi : « une alerte hors-délais clignote — un coureur attendu au checkpoint 3 ne l'a pas franchi » → appel du secteur → abandon saisi avec motif. Soir : classements publiés et partagés ; lendemain : export du rapport chiffré pour le directoire. *(Réalise FR-15 à FR-26)*
- **UJ-4. Malika suit son frère depuis Tizi Ouzou.** Vitrine publique : carte avec dernière position GPS connue sur tracé GPX ; voit son frère franchir le checkpoint 2 ; classement live se met à jour. *(Réalise FR-18 à FR-23)*

## Identité de marque / ton / style évoqués

*Source : prd.md §1, §2.1, §4.6*

- « interface qui en jette » (job coureur) ; page course publique « moderne "qui en jette" » (FR-21).
- « organisation moderne, crédible et sûre » ; crédibilité auprès de la fédération, des médias, des sponsors.
- Thèmes : sport, santé, citoyenneté, écologie.
- « sous l'égide de la fédération et du ministère des sports » (mention obligatoire sur la vitrine).
- Écologie assumée par dématérialisation : e-dossard, « zéro papier le jour J ».
- Contexte culturel : montagne algérienne, Kabylie (Yakouren, Djurdjura, Ait-Aissi, Tizi Ouzou), sponsor Ifri visé.

## Contraintes

*Sources : prd.md §5, §6, §8 ; addendum.md §3*

- **Offline-first** (structurant) : scan, fiche mission, annuaire des coureurs, e-dossard, positions GPS — tout fonctionne sans réseau, sync par lots idempotente. *(addendum.md §3)*
- **Session unique par compte** (aucun multi-appareil simultané), tous rôles. *(prd.md FR-1 ; addendum.md §3)*
- **Forme technique (PWA / natif / mixte)** : décision architecture ; contraintes UX : « caméra QR rapide sur Android d'entrée de gamme, GPS en arrière-plan, cache persistant, vitrine publique légère ». *(addendum.md §3)*
- **Langue** : V1 en **français** uniquement (interface multilingue exclue du MVP). *(prd.md §6.2)*
- **Notifications push natives exclues** du MVP ; statuts notifiés par email (FR-6). *(prd.md §6.2, FR-6)*
- **Mode hors-ligne de la vitrine exclu** du MVP. *(prd.md §6.2)*
- **Clôture inscriptions J-10** (16/03/2027) : blocage de soumission, commande médailles/t-shirts sur dossiers validés, zéro stock. *(prd.md FR-2 ; addendum.md §2)*
- **Zéro papier le jour J** ; guichets express (~300 retraits en avance, ~700 le jour J).
- **Budget borné / coût d'exploitation proche de zéro** : équipe bénévole ; SMTP mutualisé faible coût, délivrabilité boîtes algériennes et internationales. *(addendum.md §1, §3)*
- **Bus factor = 1** : sobriété et documentation exigées. *(addendum.md §3)*
- **Vente de powerbanks le jour J** (hors application), en appui de la pédagogie batterie. *(addendum.md §3)*
- **Réglementation** : dossier fédération / conformité gérés hors application (non-objectif) ; décharge + règlement intérieur acceptés en ligne, horodatés avec version (exigence juridique à l'inscription).
- **Sponsors** : option A unique (Ifri visé, emplacement signature) ou option B multiples sans exclusivité ; bascule sans dev (FR-22).
- **Non-objectifs V1** : paiement en ligne (Satim/CIB/Edahabia post-2027 ; V1 = preuves CCP), réseaux sociaux intégrés (partage par liens), module photos/vidéo, provisioning self-service, écologie outillée.

## Exigences non fonctionnelles impactant l'UX

*Sources : prd.md FR-13, FR-21, §7 ; addendum.md*

- **Performance vitrine** : premier chargement < 300 ko `[ASSUMPTION]`, premier rendu lisible < 5 s sur 3G lent `[ASSUMPTION]`, tracé GPX en chargement différé (FR-21).
- **Scan** : confirmation en < 1 s par coureur (bip + voyant) (FR-13) ; caméra QR rapide sur Android d'entrée de gamme (addendum).
- **E-dossard** : QR lisible après 30 jours de cache (FR-7) ; fiche mission disponible app fermée/réseau absent (FR-11).
- **Résultats live** : jamais de classement partiel incohérent ; fraîcheur des données affichée (transparence) (FR-16, FR-24).
- **Tracking** : opt-in, 5–10 min, « précision équilibrée » ; tracking désactivé n'enregistre rien (FR-18) ; positions > 1 h estompées (FR-19).
- **Critères de succès UX-directs** : SM-1 temps d'attente retrait < 5 min/coureur ; SM-3 ≥ 80 % dossiers validés sans échange humain ; SM-C1 « le self-service ne doit pas exclure les coureurs peu à l'aise avec le numérique ; un canal d'assistance humaine doit rester visible » ; SM-C2 ne pas augmenter la fréquence GPS au prix de la batterie.
- **Phasage UX** : 15/11/2026 = FR-1 à FR-6 + page publique d'annonce (FR-21 minimale) ; dry-run = cœur offline + PC course ; jour J = tout le Must. *(prd.md §6.1)*

## Questions ouvertes pour l'UX

*Source : prd.md §8 (+ hypothèses §9)*

1. Nombre exact de checkpoints par épreuve (hypothèse : 4 longue / 1–2 moyenne) et barrières horaires — impact carte, alertes, PC course.
2. Classements par sexe et catégories d'âge : à confirmer (crédibilité fédération).
3. Données de la 1re édition : existence, format, intégration (Should).
4. **Inscription sur place** : volume de coureurs sans email/smartphone, repli manuel (papier, inscription au guichet par un volontaire équipé) — **à trancher avant le 15/11/2026**.
5. (UX-dérivées) Alerte batterie < 15 % : Should, à confirmer (FR-25) ; positions estompées après X = 1 h (FR-19) ; cibles SM-5 (partages) et SM-6 (activation tracking) à chiffrer avec l'organisateur.

## Citations clés

- « plateforme clé en main de gestion de course de trail, conçue pour fonctionner là où le réseau n'existe pas — les zones blanches de la montagne algérienne » — prd.md §1
- « un projet sportif-citoyen outillé dont la réputation est le produit » — prd.md §1
- « s'inscrire simplement avec une interface qui en jette » — prd.md §2.1
- « savoir d'un coup d'œil où en est son dossier » — prd.md §2.1
- « savoir exactement où se placer et quoi faire le jour J, même sans réseau ; scanner vite et juste » — prd.md §2.1
- « sa checklist passe au vert "Dossier validé — dossard prêt" » — prd.md §2.3 (UJ-1)
- « caméra plein écran, bip vert par coureur, voyant rouge sur doublon ou inconnu » — prd.md §2.3 (UJ-2)
- « 217 passages en attente → envoyés » — prd.md §2.3 (UJ-2)
- « une alerte hors-délais clignote — un coureur attendu au checkpoint 3 ne l'a pas franchi » — prd.md §2.3 (UJ-3)
- « chaque pièce manquante nomme l'action à faire » — prd.md FR-5
- « le self-service ne doit pas exclure les coureurs peu à l'aise avec le numérique ; un canal d'assistance humaine doit rester visible » — prd.md §7 (SM-C1)
- « caméra QR rapide sur Android d'entrée de gamme, GPS en arrière-plan, cache persistant, vitrine publique légère » — addendum.md §3
