# Étude d'investissement — Parc de matériel de chronométrage/tracking loué aux trails algériens

> **Question :** post-MVP, acheter un parc GPS et/ou RFID pour le louer aux trails qui s'organisent en Algérie. Combien ça coûte à l'entrée, et au bout de combien d'événements c'est remboursé ?
> **Date :** 2026-11-02 · **Statut :** étude d'aide à la décision, post-MVP. Complète l'[étude technique RFID](./etude-equipement-puce-chrono-2026-11-02.md).
> **Avertissement sur les chiffres :** tous les prix matériel viennent de pages fournisseurs publiques, certaines datées. Les taux de douane et les prix de location en Algérie sont des **hypothèses de travail explicitement signalées**, pas des données vérifiées. Aucun engagement financier ne doit être pris sur ce document seul — il sert à savoir si ça vaut la peine d'aller chercher les vrais devis.

---

## 1. Réponse courte

| | RFID | GPS |
|---|---|---|
| Investissement d'entrée (rendu en Algérie, hypothèse DD 30 %) | **≈ 6 000 – 6 500 €** pour 1 point de passage, **≈ 11 000 – 12 500 €** pour 2 points | **≈ 3 900 €** pour 30 traceurs, **≈ 13 000 €** pour 100 |
| Nature de l'actif | **Parc fixe, petit, réutilisable à l'infini.** 1 lecteur sert 300 ou 2 000 coureurs sans rien changer | **Parc proportionnel au nombre de coureurs.** Suivre 500 coureurs = acheter 500 traceurs |
| Coût par édition supplémentaire | Puces jetables : 0,3 – 1,7 €/coureur, **refacturables au client** | ≈ 0 (hors casse/perte, SIM) |
| Valeur en zone blanche algérienne | **Intacte** — fonctionne hors réseau par nature | **Fortement dégradée** — le traceur GSM ne transmet rien sans couverture ; le direct meurt, il reste une trace rejouée après coup |
| Verdict comme actif locatif | ✅ **C'est l'actif à acheter** | ❌ **Mauvais investissement en Algérie**, sauf petite flotte de tête de course |

**En une phrase : le RFID est un actif locatif, le GPS est un consommable déguisé.** Le RFID a un coût fixe faible, indépendant du nombre de coureurs, et un coût variable refacturable. Le GPS a un coût qui grimpe avec chaque coureur suivi, pour une valeur — le direct — que les zones blanches de Kabylie détruisent.

**Scénario recommandé : ≈ 6 500 € (≈ 1,0 à 1,7 M DZD selon le taux de change), parc RFID 1 point de passage + 20 traceurs GPS pour la tête de course.** Remboursé en **12 à 20 événements** sous les hypothèses de prix de location du § 5 — soit 1,5 à 2 ans si tu captes 10 événements par an.

---

## 2. Le marché : combien d'événements à adresser ?

- Un agrégateur recense **86 courses référencées en Algérie, 26 villes**, toutes disciplines de course à pied confondues. Les trails identifiables (Chréa, Souhane, Jijel, Derguina, Boumerdès, Algiers Urban Trail…) en représentent une fraction.
- L'Algiers Urban Trail (2e édition, juin 2026) est organisé sous l'égide de la Wilaya d'Alger, avec la Ligue Algéroise des Sports de Montagne et un club — profil d'organisateur institutionnel, capable de payer une prestation.
- **Aucun prestataire de chronométrage algérien n'apparaît dans les résultats de recherche.** Soit le marché est vide (opportunité réelle), soit les prestataires existent et sont invisibles en ligne. **À vérifier en appelant 3-4 organisateurs** — c'est la donnée la plus importante de toute l'étude et elle ne se trouve pas sur internet.

**Hypothèse de travail retenue :** 20 à 30 trails par an en Algérie, dont tu peux en capter **8 à 12 par an** à maturité (contrainte : un seul parc, donc un seul événement par week-end, et des week-ends qui se chevauchent au printemps et à l'automne).

---

## 3. Le coût d'entrée, poste par poste

### 3.1 Matériel, prix fournisseur (hors Algérie)

**Parc RFID — 1 point de passage**

| Poste | Prix constaté |
|---|---|
| Lecteur UHF 4 ports (Impinj R700 ou Zebra FX9600) | 1 340 – 1 670 $ |
| 4 antennes panneau UHF | ~150 $ pièce → 600 $ |
| Câbles faible perte + trépieds + fixations | ~400 – 600 $ |
| Licence logicielle de chronométrage (une fois) | ~900 $ |
| Station d'énergie portable + PC terrain durci | ~600 – 900 € |
| **Sous-total** | **≈ 3 800 – 4 300 €** |

**Parc RFID — 2e point de passage** (départ *et* arrivée simultanés, + redondance si un lecteur lâche) : **+ ≈ 2 500 – 3 000 €** (2e lecteur, 4 antennes, câbles, 2e énergie ; la licence est souvent déjà couverte — **à vérifier au devis**).

**Flotte GPS**

| Poste | Prix constaté |
|---|---|
| Traceur GPS/GSM type Queclink (achat) | 150 € + TVA à l'unité, **78 – 84 € + TVA en volume** |
| Abonnement SIM M2M + gestion de flotte | ~1 € + TVA / traceur / mois |
| Traceur satellite (Iridium, le seul qui marche vraiment en zone blanche) | **499 $ + 35 $ d'activation + 15 $/mois** |

→ 30 traceurs GSM en volume ≈ **2 520 €**. 100 traceurs ≈ **8 400 €**.
→ 30 traceurs **satellite** ≈ **15 000 $ + abonnements**. **Éliminé.**

### 3.2 Le vrai multiplicateur : import, douane, homologation

C'est là que le budget se joue, et c'est la partie la moins documentée.

**Calcul officiel (DGD) :** Droits de douane = valeur en douane × taux DD. TVA = (valeur en douane + DD) × 19 %.

**Taux DD :** les sources commerciales donnent une grille 0 / 5 / 15 / 30 % selon la marchandise, et situent l'électronique dans la fourchette **20–30 %**. **Ces chiffres ne sont pas officiels et divergent entre eux.** Le tarif officiel consulté date de 2020. Le code SH exact du lecteur RFID doit être confirmé par un transitaire agréé.

**Multiplicateur résultant sur le prix CAF :**

| Taux DD retenu | Multiplicateur (DD puis TVA 19 %) |
|---|---|
| 15 % | × 1,37 |
| 30 % | **× 1,55** ← hypothèse prudente retenue |

**+ Homologation ARPCE — obligatoire, non optionnelle.** Un lecteur RFID UHF est un équipement radioélectrique :
- Le Journal Officiel (n° 05, 1442) couvre explicitement la bande **865–868 MHz** pour les appareils de faible puissance et RFID, les soumet à homologation attestée par certificat, et **plafonne la portée à 10 m** pour ces usages. *Bonne nouvelle : un portique de chronométrage lit à 3–8 m, donc dans les clous.*
- La décision ARPCE n° 28/SP/PC/ARPCE/2019 fixe la procédure : dépôt d'une demande, délivrance d'un certificat de conformité, et **marquage obligatoire du numéro d'homologation ARPCE sur l'équipement avant mise sur le marché**.
- Un texte plus récent (JO n° 13, 1447) semble modifier certaines dispositions RFID — **à faire vérifier sur le texte intégral**.
- Dossier type exigé par les cabinets spécialisés : certificat d'origine, accréditation du labo, **registre de commerce de l'importateur**, déclaration de conformité CE. Validité annoncée 3 ans ou 60 mois selon les sources — non confirmé.

**Conséquence structurante : louer du matériel radio non homologué est illégal, et l'homologation exige un registre de commerce.** Ce n'est donc pas un achat de particulier : il faut une entité juridique avant la première facture. Coût et délai de la procédure : **inconnus, à chiffrer auprès de l'ARPCE** — c'est le premier appel à passer.

**Voie de contournement à explorer en priorité :** acheter via un **importateur algérien déjà titulaire de l'homologation** pour ce type de matériel. Tu paies plus cher au catalogue, mais tu n'absorbes ni le dossier, ni le délai, ni le risque de blocage en douane. Souvent moins cher que le chemin direct une fois tout compté.

### 3.3 Coût d'entrée consolidé

Hypothèses : DD 30 %, TVA 19 %, + 8 % de transport/transitaire/assurance, hors coût d'homologation (inconnu).

| Scénario | Prix fournisseur | **Rendu en Algérie** | **En DZD (taux officiel ~150)** | **En DZD (marché parallèle ~260)** |
|---|---|---|---|---|
| **A — RFID 1 point de passage** | ≈ 4 100 € | **≈ 6 400 €** | ≈ 960 000 DZD | ≈ 1 660 000 DZD |
| **B — RFID 2 points** | ≈ 6 900 € | **≈ 10 800 €** | ≈ 1 620 000 DZD | ≈ 2 800 000 DZD |
| **C — A + 20 traceurs GPS** | ≈ 5 800 € | **≈ 9 100 €** | ≈ 1 365 000 DZD | ≈ 2 370 000 DZD |
| **D — A + 100 traceurs GPS** | ≈ 12 500 € | **≈ 19 600 €** | ≈ 2 940 000 DZD | ≈ 5 100 000 DZD |

> ⚠️ **L'écart entre les deux colonnes DZD — du simple au double — est le plus gros facteur de toute l'étude.** Avant de comparer des scénarios matériel, il faut trancher le canal de change et de paiement fournisseur. C'est une décision financière, pas technique, et elle pèse plus lourd que le choix du lecteur.

---

## 4. Charges récurrentes par événement

| Poste | Estimation | Refacturable au client ? |
|---|---|---|
| Puces dossard jetables | 0,23 – 1,68 €/coureur → **300 – 1 700 € pour 1 000 coureurs** | ✅ Oui, en consommable ligne à ligne |
| Transport du parc + 2 opérateurs sur site | variable selon la wilaya | ✅ Oui |
| SIM M2M des traceurs GPS | ~1 €/traceur/mois | ✅ Oui |
| Casse, perte, usure (provision) | **10 % de la valeur du parc par an** | ❌ Non — c'est ta marge qui l'absorbe |
| Assurance du matériel | à chiffrer | ❌ Non |

**Règle de gestion :** les puces sont facturées **au coureur inscrit**, pas au forfait. Un organisateur qui annonce 1 000 coureurs et en réunit 600 ne doit pas te laisser 400 puces sur les bras.

---

## 5. Au bout de combien d'événements c'est remboursé ?

**⚠️ Le prix de location en Algérie est la seule donnée que je n'ai pas pu sourcer.** Ce qui suit est une hypothèse construite, à valider par 3 appels à des organisateurs avant tout achat.

**Construction de l'hypothèse :** un trail algérien de 500 à 1 000 coureurs à ~1 500 DZD d'inscription encaisse 750 000 à 1 500 000 DZD. Le chronométrage représente classiquement 8 à 15 % du budget d'une course. → **prestation chronométrage facturable : 80 000 à 180 000 DZD par événement** (≈ 300 à 1 200 € selon le taux), consommables en sus.

**Marge nette retenue, prudente : 70 000 DZD par événement** (après transport, opérateurs, provision casse).

| Scénario | Investissement (taux officiel) | **Événements pour rembourser** | À 10 événements/an |
|---|---|---|---|
| **A — RFID 1 point** | 960 000 DZD | **≈ 14** | ~1,4 an |
| **B — RFID 2 points** | 1 620 000 DZD | ≈ 23 | ~2,3 ans |
| **C — A + 20 GPS** | 1 365 000 DZD | ≈ 20 | ~2 ans |
| **D — A + 100 GPS** | 2 940 000 DZD | ≈ 42 | ~4,2 ans |

**Au taux du marché parallèle, multiplier tous les délais par ~1,7.** Le scénario A passe de 14 à ≈ 24 événements, le scénario D de 42 à ≈ 73 — c'est-à-dire **jamais**, le matériel étant usé avant.

**Lecture :** seul le **scénario A** tient sous les deux taux de change. Il est aussi le seul qui ne pousse pas à t'endetter avant d'avoir une preuve de marché. Les scénarios B et C se financent **sur les revenus de A**, pas à l'entrée.

---

## 6. Pourquoi le GPS est un piège économique ici

Trois raisons cumulatives :

1. **Le coût suit le nombre de coureurs, pas le nombre d'événements.** C'est l'inverse d'un actif locatif. Un lecteur RFID à 1 500 € sert 2 000 coureurs ; suivre 2 000 coureurs en GPS coûte 160 000 €.
2. **La valeur du GPS, c'est le direct — et la zone blanche le tue.** Un traceur GSM sans couverture ne transmet rien : il bufferise et vide sa mémoire au retour du réseau. L'organisateur paie du « live » qui arrive après la course. Le satellite résout le problème mais à 499 $ + abonnement l'unité : hors sujet.
3. **Le brief Azzel a déjà la bonne réponse, et elle est gratuite** : le tracking GPS passe par **le téléphone du coureur** via l'app native (épopée 6), avec pédagogie batterie. Zéro matériel, zéro douane, zéro logistique de restitution.

**Le seul usage GPS matériel qui se défend : 15 à 25 traceurs pour la tête de course et les serre-files** — ceux dont la position intéresse vraiment la diffusion et la sécurité, et dont la restitution se contrôle. Investissement 1 500 – 2 500 € rendu, argument commercial fort, logistique maîtrisable. **Pas un traceur par coureur.**

---

## 7. Les risques qui ne sont pas dans le tableau

| Risque | Gravité | Atténuation |
|---|---|---|
| **Homologation ARPCE refusée ou interminable** | 🔴 Bloquant total — parc inutilisable et invendable | Passer par un importateur déjà homologué ; vérifier **avant** d'acheter |
| Taux de change / accès aux devises pour payer le fournisseur | 🔴 Double le coût réel | Trancher le canal de paiement en amont |
| Marché plus petit qu'estimé (< 5 événements/an) | 🟠 Amortissement jamais atteint | Démarrer au scénario A ; exiger 3 engagements d'organisateurs avant d'acheter |
| Un prestataire déjà installé et invisible en ligne | 🟠 Guerre des prix | Les 3 appels du § 2 |
| Concentration saisonnière (printemps/automne) | 🟠 Plafonne le nombre d'événements/an à parc constant | Le 2e parc (scénario B) ne se justifie que si deux courses tombent le même week-end |
| Panne du parc unique le jour J | 🟠 Réputation | Le QR d'Azzel **est** le plan de repli — avantage décisif face à un prestataire RFID pur |
| Casse/perte des traceurs GPS restitués par les coureurs | 🟡 10 %/an | Caution ou pièce d'identité à la remise |

---

## 8. Le vrai levier : tu ne vends pas du matériel, tu vends Azzel

Un prestataire de chronométrage classique loue un lecteur et repart. Toi tu arrives avec **la plateforme d'inscription, la vitrine, le suivi volontaires, le PC course et les résultats live déjà intégrés** — le matériel n'est que le dernier maillon.

Conséquences économiques directes :
- Tu factures **une prestation d'événement**, pas une location de boîtier. Le panier moyen monte sans que le coût marginal bouge.
- Le matériel RFID devient un **argument de montée en gamme** sur la location d'instance déjà prévue au brief, pas un métier séparé.
- Le **repli QR est intégré** : si le lecteur tombe, la course continue. Aucun prestataire RFID pur ne peut dire ça. C'est ton vrai avantage concurrentiel, et il ne coûte rien de plus.
- Le contrat « source de passage » (`source: 'qr-scan' | 'rfid' | 'manual'` dans `packages/shared`, cf. étude technique § 7) est **le prérequis logiciel de tout ce business plan**. Quelques heures de travail aujourd'hui, pendant que l'épopée 4 s'écrit.

---

## 9. Ce qu'il faut faire, dans l'ordre

**Avant toute dépense — coût ≈ 0, durée ~2 semaines :**

1. ☐ **Appeler l'ARPCE** : procédure, coût, délai et faisabilité de l'homologation d'un lecteur RFID UHF 865–868 MHz. Demander si un importateur est déjà homologué sur ce type de matériel. *C'est le point d'arrêt n° 1 : si ça ne passe pas, le reste est sans objet.*
2. ☐ **Appeler 3 organisateurs de trails algériens** (Chréa, Algiers Urban Trail, Jijel) : qui les chronomètre aujourd'hui, combien ils paient, ce qui leur manque. *C'est la donnée qui valide ou détruit le § 5.*
3. ☐ **Transitaire agréé** : code SH du lecteur RFID, taux DD réel, coût de dédouanement.
4. ☐ **Trancher le canal de change** et de paiement fournisseur.
5. ☐ **Devis fermes** : lecteur 4 ports, 4 antennes, licence compatible, 1 000 puces, 20 traceurs GPS.

**Puis, si et seulement si les 5 points passent :**

6. ☐ Constituer l'entité juridique (registre de commerce exigé par l'homologation).
7. ☐ **Acheter le scénario A uniquement** (≈ 6 400 €), et seulement avec **3 engagements écrits d'organisateurs** en main.
8. ☐ Édition d'Ait-Aissi 2028 comme terrain d'essai à domicile, avec le QR en repli actif.
9. ☐ Réinvestir les revenus dans le 2e parc, pas d'endettement à l'entrée.

**Et dès maintenant, indépendamment de tout ça :** le champ `source` dans `packages/shared`. C'est la seule action de ce document qui a un coût aujourd'hui, et elle est négligeable.

---

## 10. Sources

Relevé le 2026-11-02. Prix fournisseurs indicatifs, plusieurs pages datées. **Les taux de douane et les prix de location algériens sont des hypothèses, pas des données sourcées.**

**Matériel RFID**
- [Race Directors HQ — How to Build an RFID Race Timing System](https://www.racedirectorshq.com/read/build-rfid-race-timing-system-20/)
- [Agee Race Timing — package FX9600 (PDF)](http://www.ageeracetiming.com/resources/AgeeRaceTiming_FX9600Package.pdf)
- [Gateway RFID Store — Impinj R700](https://gatewayrfidstore.com/shop/impinj-r700-rain-uhf-rfid-reader/)
- [Atlas RFID Store — Zebra FX9600](https://www.atlasrfidstore.com/zebra-fx9600-rfid-reader-8-port/)
- [RACE RESULT — dossards à puce et Track Box Passive](https://www.raceresult.com/en/solutions/trackingpassive)
- [India RFID Store — puces de chronométrage](https://www.indiarfidstore.com/rfid-race-timing-system)

**Matériel et services GPS**
- [Racemap — traceurs GPS, location et achat](https://go.racemap.com/gps-tracker) — location dès 110 € + TVA pour 5 traceurs/week-end, achat 150 € + TVA
- [Racemap — tarifs](https://weblium.racemap.com/pricing) — exemple 13 traceurs à 22 € l'unité ; carte 25 € + TVA par cycle de 7 jours
- [Racemap — matériel pour le live tracking](https://docs.racemap.com/hardware-for-live-tracking)
- [LiveViewGPS — traceur Iridium solaire](https://www.liveviewgps.com/iridium+solar+asset+tracker.html) — 499 $ + 35 $ activation + 15 $/mois
- [Lowergear — location SPOT](https://www.lowergear.com/rent-a-spot-gps-personal-tracker) — 299 $ pour 5 unités minimum
- [Follow My Challenge](https://followmychallenge.com/) · [TackTracker LiveTrack](https://tacktracker.com/web/solution/livetrack) — modèles concurrents, tarifs non publiés

**Réglementation algérienne**
- [ARPCE — JO n° 05 (1442), appareils de faible puissance et RFID](https://www.arpce.dz/fr/file/v4h1f1) — bande 865–868 MHz, homologation obligatoire, portée plafonnée à 10 m
- [ARPCE — décision n° 28/SP/PC/ARPCE/2019](https://www.arpce.dz/fr/file/u8g9g6) — procédure d'homologation, certificat de conformité, marquage obligatoire
- [ARPCE — JO n° 13 (1447)](https://www.arpce.dz/fr/file/b9v0s3) — texte plus récent, dispositions RFID à vérifier
- [5M Global — homologation ARPCE Algérie](https://5mglobal.com/homologation/homologation-algeria/) · [ib-lenhardt — type approval Algeria](https://ib-lenhardt.com/type-approval/algeria) — vue cabinet, non officielle
- [Douanes algériennes — tarif douanier (PDF 2020)](https://www.douane.gov.dz/IMG/pdf/mise_a_jour_du_tarif_2020.pdf)
- [DziraTransit — frais de douane 2026](https://dziratransit.com/blog/frais-de-douane-algerie-2026) · [Guide importation Algérie](https://www.businessplanmodele.com/blogs/actualites/importer-marchandise-algerie) — sources commerciales, taux divergents
- [Algeriedata — micro-importation 2026, cadre auto-entrepreneurs](https://algeriedata.com/micro-importation-en-algerie-2026-guide-complet-du-nouveau-cadre-legal-pour-auto-entrepreneurs/) — régime à vérifier

**Marché**
- [Marathons Algérie — calendrier des courses](https://algiersmarathon.com/courses/) — 86 courses référencées, 26 villes
- [Ahotu — calendrier Algérie 2026-2027](https://www.ahotu.com/fr/calendrier/algerie)
- [Finishers — courses en Algérie](https://www.finishers.com/en/destinations/africa/algeria)
- [Algiers Urban Trail 2026](https://www.coursealgerie.com/courses/algiers-urban-trail-2026)
