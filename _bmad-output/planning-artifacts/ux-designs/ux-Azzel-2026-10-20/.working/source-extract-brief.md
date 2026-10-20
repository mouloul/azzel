# Extract UX — Brief Azzel (brief.md + addendum.md)

Sources :
- `brief.md` — `_bmad-output/planning-artifacts/briefs/brief-Azzel-2026-10-19/brief.md`
- `addendum.md` — `_bmad-output/planning-artifacts/briefs/brief-Azzel-2026-10-19/addendum.md`

---

## Vision produit (problème, proposition de valeur)

**Source : brief.md (Résumé exécutif, Le problème, La solution, Ce qui rend Azzel différent, Vision)**

- Azzel = « plateforme clé en main de gestion de course de trail », conçue pour fonctionner « là où le réseau n'existe pas — les zones blanches de la montagne algérienne ».
- Besoin réel immédiat : 2e édition du trail d'Ait-Aissi (Yakouren, Kabylie), 26 mars 2027, au moins 1 000 coureurs sur deux catégories, organisée par une équipe de jeunes volontaires sans aide externe.
- « Azzel n'est pas un outil de chronométrage : c'est un **projet sportif-citoyen outillé** dont la réputation est le produit. »
- Quatre thèmes structurels : sport, santé, citoyenneté, écologie.
- « L'application est la vitrine d'un travail sérieux, destinée à convaincre sponsors, fédération et médias. »
- Problème : plateformes pro de chronométrage (RFID, tapis, satellite) financièrement inaccessibles ; 1re édition gérée sur **papier + Excel** (files au retrait des dossards, saisies manuelles, aucun suivi en direct, résultats lents) ; zones sans couverture 3G/4G exploitable ; réussite terrain (2 chaînes TV nationales, milliers de vues réseaux) non convertie en crédibilité durable.
- Coût du statu quo : « un travail bénévole épuisant, des erreurs de pointage et une réputation médiatique non capitalisée ».
- Différenciateurs : **offline-first radical** (« Aucune fonction critique ne dépend du réseau ») ; bâti par un bénévole de l'équipe, offert gratuitement à l'organisateur (PI conservée par le créateur) ; coût d'exploitation proche de zéro ; multi-organisation natif (`organisation → événement → édition`) ; quatre thèmes « structurels, pas marketing » (zéro papier, alertes/pédagogie batterie, volontaires du village, classements/chrono).
- Vision 2-3 ans : « l'outil de référence des trails locaux algériens », catalogue d'instances louables par événement, « chaque organisateur recevant la même plateforme à son image » ; « le produit initié par un village devient un bien commun du trail algérien ».
- Critère de succès (soir du 27 mars 2027) : félicitations de la fédération, reportages élogieux des TV, forte visibilité réseaux, « un sponsor qui renouvelle ».

## Utilisateurs / personas

**Source : brief.md (À qui cela sert) ; addendum.md (§1 Jobs to be done détaillés)**

Verbatim des acteurs cités :

- **« L'équipe organisatrice d'Ait-Aissi »** (l'organisateur est le client) — « passer de "groupe de jeunes" à une organisation crédible ; piloter 1 000 coureurs sans se noyer » ; « gérer 1 000 coureurs sans se noyer ; bâtir une réputation dans le milieu trail ; à terme, s'étendre à d'autres équipes » (addendum).
- **« Les volontaires »** (~équipe villageoise) — « savoir exactement où se placer et quoi faire, même sans réseau » ; expériences par secteurs : ravitaillement, accueil des sportifs, sécurité des tronçons routiers, sécurité ligne d'arrivée, coordination de la distribution des dossards ; « Le scan QR n'est qu'une mission parmi d'autres » ; fiche mission offline (secteur, rôle, contact, horaire) (addendum).
- **« Les coureurs »** (1 000+ attendus, longue et courte distance) — « s'inscrire simplement, être suivis, vivre une expérience "pro" » ; « Inscription simple, interface moderne "qui en jette" » (addendum).
- **« Les sponsors »** — option A : **sponsor unique** (Ifri Algérie visé, emplacement signature) ; option B de repli : plusieurs sponsors plus petits, sans exclusivité ; job : « Renforcer l'image "entreprise du peuple / entreprise locale" soutenant les petites initiatives ambitieuses ; profiter de la présence médiatique » ; contractualisation **hors application** (addendum).
- **« Fédération, médias, proches »** — « une course lisible de l'extérieur, résultats vérifiables, carte en direct ».
- Le **développeur** (bénévole de l'équipe, solo assisté par IA) — mentionné comme contexte, pas utilisateur direct.
- **« Chargé de communication : un volontaire dédié (mission du portail) »** (addendum §3).

## Besoins et jobs-to-be-done

**Source : brief.md (La solution, Critères de succès) ; addendum.md (§1, §2, §3)**

- Inscriptions en ligne (2 catégories) avec décharge de bonne santé et règlement intérieur acceptés + dépôt preuve de paiement CCP ; dossier autoporté : « le coureur voit d'un coup d'œil ce qui manque, les organisateurs valident » ; dossier self-service (checklist : décharge acceptée, règlement intérieur accepté, preuve CCP déposée).
- E-dossard QR hors-ligne : « dossier validé = dossard prêt, remise express le jour J (zéro papier) ».
- Portail volontaires : découpage de la zone en secteurs, missions claires, fiche mission offline dans la poche.
- Chronométrage par scan QR aux checkpoints, hors-ligne puis synchronisation par lots ; classements séparés par catégorie, départs échelonnés ; 3 bénévoles scanneurs par checkpoint « pour absorber les files » (addendum).
- Tracking GPS des coureurs sur carte interactive (positions espacées, pédagogie batterie forte) ; Should : « alerte batterie faible (< 15 %) » (addendum).
- Vitrine publique : page course moderne, résultats en direct partageables, mention de l'égide (fédération, ministère des sports), mise en valeur des sponsors (option A / option B).
- Portail admin de pilotage : dossiers, passages, alertes hors-délais, abandons.
- Rapports chiffrés post-course (bilan du directoire).
- Contenu progressif à l'approche de la course (parcours, préparation, région, hébergement/restauration) — coureur (addendum) ; Should : « timeline d'engagement (contenu progressif) » (addendum §2).
- Historique 1re édition (Should, « données à récupérer, à vérifier ») (addendum §2).
- Critères produit `[HYPOTHÈSE — à ajuster]` : retrait dossard < 5 min d'attente/coureur ; 100 % des scans synchronisés au soir, zéro passage perdu ; ≥ 80 % des dossiers validés sans échange humain ; résultats live consultables pendant la course, partages `[à chiffrer]`.

## Surfaces / écrans / fonctionnalités mentionnés (verbatim)

**Source : brief.md (La solution, Périmètre) ; addendum.md (§2 MoSCoW, §6)**

Fonctionnalités / surfaces citées verbatim :

- « **Inscriptions en ligne** » (2 catégories) — décharge de bonne santé, règlement intérieur, preuve de paiement CCP, dossier autoporté
- « dossier self-service »
- « **E-dossard QR** » (zéro papier)
- « **Portail volontaires** » (secteurs/missions, fiche mission offline)
- « **Chronométrage par scan QR** » / « chrono scan QR offline-first » — classements séparés, départs échelonnés
- « **Tracking GPS** » sur carte interactive — pédagogie batterie, alerte batterie faible (< 15 %) (Should)
- « **Vitrine publique** » — page course moderne, résultats en direct partageables, égide (fédération, ministère des sports), sponsors (option A : sponsor unique / option B : plusieurs sponsors)
- « **Portail admin** » — dossiers, passages, « alertes hors-délais », abandons
- « **Rapports chiffrés post-course** »
- « timeline d'engagement (contenu progressif) » (Should) ; « historique 1re édition » (Should)
- Could : « module photos/média (galerie par coureur) » ; « kit presse pour TVs locales » ; « emplacements sponsors avancés »
- Idées parquées : « Rapport sponsor auto-généré (visibilité, chiffres, retombées) » ; « Multi-édition approfondi : coureurs revenants, comparatifs inter-éditions » ; « Emplacement signature sponsor avancé (au-delà du logo) »
- Won't (cette édition) : gestion du sponsoring ; dossier fédération ; passerelle de paiement en ligne (Satim/CIB écarté) ; provisioning self-service d'instances
- Logistique jour J : guichets multiples avec créneaux, remise express, stade unique (départ, arrivée, village accueil, retrait dossards), check-list téléphones/batteries/impression dossards QR, « répétition générale (dry-run) », synchronisation NTP des téléphones bénévoles au QG, vente de powerbanks.

## Identité de marque / ton / style évoqués

**Source : brief.md (Résumé exécutif, La solution, À qui cela sert) ; addendum.md (§1, §4)**

- « projet sportif-citoyen outillé » ; la réputation est le produit.
- Quatre thèmes structurels : sport, santé, citoyenneté, écologie — « structurels, pas marketing ».
- « vitrine d'un travail sérieux » ; « page course moderne » ; « résultats en direct partageables ».
- Expérience coureur « pro » ; « interface moderne "qui en jette" » (addendum).
- Image sponsor : « entreprise du peuple / entreprise locale » (addendum).
- Ton implicite : sérieux, crédible, sobre (sobriété technique obligatoire), ancrage villageois/local, « bien commun du trail algérien ».
- Réussite à montrer : 2 chaînes TV nationales, reportages ~5 min, milliers de vues Facebook/Instagram/TikTok, « belles images ».

## Contraintes

**Source : brief.md (Contraintes et risques assumés, Périmètre) ; addendum.md (§3, §5)**

- **Offline-first total** (zones blanches, pas de 3G/4G exploitable) ; « Aucune fonction critique ne dépend du réseau » ; synchronisation par lots.
- Hétérogénéité des smartphones ; économie de batterie (tracking GPS en arrière-plan, pédagogie batterie, vente de powerbanks le jour J).
- Scan QR caméra ; tracking GPS en arrière-plan — contraintes pour la forme technique (PWA / natif / mixte, « reporté à l'architecture »).
- Plateforme : stade unique d'Ait-Aissi (départ, arrivée, village accueil, retrait dossards) ; retrait échelonné ~300 en avance / ~700 le jour J ; 3 bénévoles scanneurs par checkpoint ; ravitaillement par véhicule ; secours par volontaires ; répétition générale avant jour J ; synchronisation NTP au QG.
- Temps : développement solo assisté par IA, 5 mois de piste ; « le périmètre Must est taillé pour ce budget temps ; tout glissement se paie dans le Should ».
- Bus factor = 1 : « documentation et sobriété techniques obligatoires dès le premier jour » `[HYPOTHÈSE : à confirmer comme exigence]`.
- Paiement : pas de passerelle en ligne (Satim/CIB écarté) — preuve CCP + validation humaine.
- Sponsoring et dossier fédération : hors application (contractualisation hors app).
- Multi-organisation : schéma `organisation → événement → édition` dès la V1 (location d'instances par événement).
- Langue : documents en français ; contexte algérien (CCP, Satim/CIB, Ifri Algérie, fédération algérienne, TVs nationales) — langue(s) de l'interface non précisées.
- Échéance : MVP opérationnel pour l'ouverture des inscriptions `[HYPOTHÈSE : décembre 2026]` ; course le 26/03/2027.
- Accessibilité : non traitée dans les sources.

## Questions ouvertes pour l'UX

**Source : brief.md (Périmètre, Critères de succès) ; addendum.md (§5)**

- **Forme technique (PWA / natif / mixte)** non tranchée → impacte directement les patterns UX offline, scan QR caméra, tracking GPS en arrière-plan.
- Seuils de succès chiffrés à arrêter au PRD (retrait < 5 min ; 100 % scans synchronisés ; ≥ 80 % autovalidation ; partages à chiffrer).
- Date d'ouverture des inscriptions (hypothèse décembre 2026) à décider avec l'organisateur → calendrier du parcours d'inscription.
- Données de la 1re édition : existence et format à vérifier → conditionne l'« historique 1re édition » (Should).
- Option sponsor A (unique, Ifri) vs B (plusieurs petits) : comment l'UX vitrine absorbe-t-elle les deux scénarios ?
- Hébergement et exploitation des instances louées : à documenter en phase architecture (personnalisation « à leur image » : jusqu'où ?).
- Comment rendre visible « ce qui manque » dans un dossier (autoporté) sans friction pour des coureurs hétérogènes ?
- UX du volontaire hors-ligne : comment garantir lisibilité de la fiche mission (secteur, rôle, contact, horaire) sans réseau et sur smartphones hétérogènes ?
- Pédagogie batterie « forte » et alerte < 15 % : forme exacte non définie (nudge, écran dédié, notification ?).
- Contenu progressif (timeline d'engagement) : Should, périmètre exact non défini si le temps manque.
- Guichets multiples avec créneaux (retrait jour J) : mécanique de créneaux à designer (~700 dossards).
- Langue(s) d'interface et accessibilité : absentes des sources.
- « Emplacements sponsors avancés » (Could) et « rapport sponsor auto-généré » (parquées) : non spécifiés.

## Citations clés

**brief.md**
- « Azzel n'est pas un outil de chronométrage : c'est un **projet sportif-citoyen outillé** dont la réputation est le produit. » — brief.md
- « conçue pour fonctionner là où le réseau n'existe pas — les zones blanches de la montagne algérienne » — brief.md
- « le coureur voit d'un coup d'œil ce qui manque, les organisateurs valident » — brief.md
- « dossier validé = dossard prêt, remise express le jour J (zéro papier) » — brief.md
- « Offline-first radical — conçu dès l'origine pour les zones blanches, pas adapté après coup. Aucune fonction critique ne dépend du réseau. » — brief.md
- « s'inscrire simplement, être suivis, vivre une expérience "pro" » — brief.md
- « une course lisible de l'extérieur, résultats vérifiables, carte en direct » — brief.md
- « passer de "groupe de jeunes" à une organisation crédible » — brief.md
- « chaque organisateur recevant la même plateforme à son image » — brief.md
- « le produit initié par un village devient un bien commun du trail algérien » — brief.md
- « aucune fonctionnalité décorative ne survivra à cette date [26 mars] » — brief.md
- « un travail bénévole épuisant, des erreurs de pointage et une réputation médiatique non capitalisée » — brief.md

**addendum.md**
- « Inscription simple, interface moderne "qui en jette" » — addendum.md §1
- « Renforcer l'image "entreprise du peuple / entreprise locale" soutenant les petites initiatives ambitieuses » — addendum.md §1
- « Le scan QR n'est qu'une mission parmi d'autres » — addendum.md §1
- « Fiche mission offline (secteur, rôle, contact, horaire) » — addendum.md §1
- « contenu progressif à l'approche de la course (parcours, préparation, région, hébergement/restauration) » — addendum.md §1
- « 3 bénévoles scanneurs par checkpoint (pour absorber les files) » — addendum.md §3
- « répétition générale (dry-run) avant le jour J ; synchronisation NTP des téléphones bénévoles au QG » — addendum.md §3
- « Vente de powerbands [powerbanks] le jour J : recette additionnelle et trace GPS vivante (santé) » — addendum.md §3
- « Félicitations de la fédération, reportages élogieux des TV, forte visibilité sur les réseaux et belles images » — addendum.md §4
