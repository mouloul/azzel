# Document d'intention — Azzel

Source : brainstorming du 2026-10-19 (memlog de session). Entrée destinée au skill `bmad-product-brief`.

## 1. Positionnement

Azzel n'est pas un outil de chronométrage : c'est un **projet sportif-citoyen outillé**. La réputation est le produit — l'application est la vitrine d'un travail sérieux, destinée à convaincre sponsors majeurs et partenaires. Quatre thèmes fondateurs, structurels et non décoratifs : **sport, santé, citoyenneté, écologie** (ex. : zéro papier / e-dossard = écologie ; multi-instance = citoyenneté à l'échelle des villages ; ce langage est celui que cherche le sponsor « entreprise du peuple »).

## 2. Contexte réel

- **2e édition du trail du village Ait-Aissi** (Yakouren, Kabylie), le **26 mars 2027**.
- Organisation par une **équipe de jeunes volontaires**, sans aide externe.
- Preuve médiatique de la 1re édition : **2 chaînes TV nationales** (reportages ~5 min), **milliers de vues** sur Facebook/Instagram/TikTok.
- **Au moins 1000 participants attendus** sur **2 catégories** (longue et courte) — le « tsunami » est le scénario attendu, il doit être tenu.
- Succès visé au soir du 27/03 : félicitations de la fédération, reportages élogieux des TVs locales, forte visibilité réseaux avec de belles images.

## 3. Jobs to be done (4 acteurs)

| Acteur | Job |
|---|---|
| **Organisateur** | Se construire une réputation dans le milieu du trail grâce à la modernisation de la gestion : passer de « groupe de jeunes » à organisation crédible, puis scaler vers d'autres équipes/organisateurs. |
| **Sponsor unique : Ifri Algérie** | Renforcer son image d'« entreprise du peuple / entreprise locale » soutenant les petites initiatives ambitieuses + profiter de la présence médiatique. Le sponsoring est **contractualisé HORS application** ; l'app se limite à **mettre en valeur le sponsor unique** une fois le contrat signé. |
| **Coureur** | Inscription simple avec une interface moderne « qui en jette » (le wow fait partie du job) ; accès centralisé à tout ce qui valide sa participation (dossier, pièces, paiement) avec **dossier autoporté** et checklist de statut visible d'un coup d'œil (« il te manque le certificat ») ; **contenu progressif** à l'approche de la course (parcours, conseils de préparation, découverte de la région, restauration/hébergement). |
| **Volontaire** | Expérience fluide avec une **mission claire** : découpage de la zone en **secteurs** (ravitaillement, accueil, sécurité des tronçons routiers, sécurité ligne d'arrivée, distribution dossards… le scan n'est qu'UNE mission parmi d'autres) ; **fiche mission offline** dans la poche le jour J (secteur, rôle, contact, horaire). |

## 4. Cap stratégique : Championne + Forge

Azzel doit **rayonner ET être scalable**.

- Schéma de données `organisation → événement → édition` **dès la V1** (multi-organisation natif + multi- édition : capitaliser les données d'une édition sur l'autre — coureurs revenants, historique, comparatifs).
- **Multi-instanciation future** : un autre trail pourra demander une instance d'Azzel à son image, avec les mêmes outils que l'instance Ait-Aissi.
- **Récupérer les données de la 1re édition** si disponibles (à vérifier) et les intégrer comme historique.

## 5. MoSCoW retenu pour le 26/03/2027

**Must**
- Inscriptions sur les 2 catégories (longue/courte) avec upload du certificat + preuve de paiement CCP.
- Dossier self-service (checklist de statut autoportée).
- E-dossard QR (zéro papier le jour J : dossier valide en ligne = dossard prêt).
- Portail volontaires : secteurs/missions, fiche mission offline.
- Chrono par scan QR aux ravitos, **offline-first**, avec **classements séparés** par catégorie et **départs échelonnés** (absorber la vague au premier ravito).
- Vitrine publique : page course + résultats live partageables, mention « sous l'égide de la fédération et du ministère des sports », mise en valeur du sponsor unique.
- Portail admin de pilotage + alertes hors délais.
- Tracking GPS sur carte, avec **grosse pédagogie batterie** (prévoir batterie externe).
- Rapports chiffrés post-course (collecte au fil de l'eau : inscrits, passages, abandons, portée).

**Should**
- Timeline d'engagement (contenu progressif).
- Historique de la 1re édition.
- Alerte batterie.

**Could**
- Module photos/media (galerie).
- Kit presse pour les TVs locales.
- Emplacement signature sponsor avancé.

**Won't**
- Gestion du sponsoring (HORS app).
- Dossier fédération (hors application).
- Passerelle de paiement en ligne.
- Provisioning self-service d'instances.

## 6. Contraintes fortes

- **Offline-first total** : zone sans couverture réseau (zones blanches).
- **Hétérogénéité des smartphones** des participants/volontaires.
- **Économie de batterie** (tracking GPS toute la course).
- **Logistique jour J** :
  - Stade unique d'Ait-Aissi : point unique départ/arrivée/village accueil.
  - Retrait dossards échelonné : ~300 en avance (200 hébergés sur place + ~100 locaux), ~700 le jour J → remise express en guichets multiples avec créneaux.
  - Ravitaillement acheminé par véhicule adapté avant le début de la course.
  - Sécurité & secours gérés par volontaires, comme les autres missions.
  - Chargé de communication = volontaire (une mission du portail volontaires).
  - Check-list téléphones/batteries/impression dossards QR + répétition générale (dry-run) avant le jour J.

## 7. Idées notables parquées

- Vente de **powerbanks le jour J** : nouvelle rentrée d'argent (+ trace vivante = santé).
- **Rapport sponsor** auto-généré (visibilité, chiffres, retombées) — écarté pour l'instant.
- **Multi-édition** approfondi (coureurs revenants, comparatifs).
