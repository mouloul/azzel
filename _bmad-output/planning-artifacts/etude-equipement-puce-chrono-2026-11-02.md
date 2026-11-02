# Étude — Équipement à puce pour relevé automatique des passages (trail)

> **Contexte :** trail d'Ait-Aissi, 2e édition, 26 mars 2027, ≥ 1 000 coureurs, 2 catégories, Kabylie (zones blanches), équipe bénévole, coût d'exploitation visé proche de zéro.
> **Question posée :** le chronométrage par puce (RFID) est-il accessible à Azzel, et si oui sous quelle forme ?
> **Référence de départ :** le brief produit écarte les plateformes pro (RFID, tapis, satellite) comme « financièrement inaccessibles ». Cette étude vérifie cette affirmation avec des chiffres, et distingue ce qui est vrai *partout* de ce qui ne l'est que *sur les checkpoints isolés*.
> **Date :** 2026-11-02 · **Statut :** étude d'aide à la décision, hors périmètre *Must* V1.

---

## 1. Conclusion en une page

**L'affirmation du brief est vraie pour les checkpoints de montagne, fausse pour le départ et l'arrivée.**

| | Checkpoints isolés (zone blanche) | Départ / Arrivée (base de vie) |
|---|---|---|
| Contrainte dominante | Alimentation, portage, opérateur, météo | Débit : 1 000 coureurs en masse, sprints finaux serrés |
| RFID passif | Mauvais rapport coût/bénéfice : il faut porter lecteur + antennes + batterie + opérateur formé sur chaque poste | **Bon** : c'est exactement le cas d'usage où le RFID bat le scan manuel |
| Scan QR (épopée 4, déjà spécifiée) | **Bon** : un téléphone, un bénévole, zéro alim secteur, zéro douane | Médiocre : ~1–3 s par coureur, impossible sur un départ en masse et sur une arrivée au coude-à-coude |

**Recommandation : ne rien changer pour la V1 du 26 mars 2027.** Le QR offline reste la seule solution tenable dans le budget temps (5 mois, dev solo) et le budget argent (≈ 0). Le départ en masse se traite par **départ échelonné + heure officielle serveur** — déjà la décision d'architecture AD-3 — et l'arrivée par un double relevé (scan + vidéo horodatée) en filet de sécurité.

**En parallèle, préparer l'après** : figer dans `packages/shared` un contrat « source de passage » agnostique du capteur, de sorte qu'un lecteur RFID devienne en V2 une source d'événements de plus dans la même outbox, sans réécrire l'épopée 4. Coût aujourd'hui : quelques heures de conception. Gain : la porte RFID reste ouverte sans la payer.

---

## 2. Les trois familles techniques

### 2.1 RFID UHF passif (EPC Gen2, 860–960 MHz) — le standard du running de masse

La puce n'a pas de batterie : elle est réveillée et alimentée par l'onde du lecteur. C'est la technologie de MyLaps BibTag, de RACE RESULT passif, de ChronoTrack.

- **Puce** : collée au dos du dossard (jetable) ou attachée au lacet (réutilisable, à rendre).
- **Lecteur** : boîtier 4 ou 8 ports, alimenté en 220 V ou batterie.
- **Antennes** : panneaux sur trépieds (portique) ou tapis au sol.
- **Portée** : ~3–8 m en conditions favorables.
- **Points durs réels** : la puce doit « voir » l'antenne — un corps humain, un sac d'hydratation plein d'eau ou une plaque métallique entre la puce et l'antenne tue la lecture. La boue et l'humidité dégradent. Il faut un poste alimenté et un opérateur.

### 2.2 RFID actif (transpondeur à batterie)

Le transpondeur émet lui-même : portée et fiabilité supérieures, boîtier réutilisable à consigner et récupérer après la course.

- Prix unitaire sans commune mesure : **45 € HT l'unité en petite quantité, ~21 € HT au-delà de 5 000 unités** (tarif public RACE RESULT).
- Pour 1 000 coureurs : **21 000 à 45 000 €** de transpondeurs, plus la gestion de la consigne et des pertes.
- **Éliminé** pour Azzel. Technologie de sport auto / cyclisme sur circuit, pas de trail associatif.

### 2.3 Boîtiers autonomes tout-en-un pour checkpoints

Catégorie récente, conçue précisément pour le problème du trail : lecteur UHF + batterie + GPS + SIM 4G dans un seul boîtier posé au sol.

- Exemple : **RACE RESULT Track Box Passive** — autonomie annoncée 10–18 h sur batterie interne, jusqu'à 32 h en configuration étendue, alimentable par panneau solaire ; cas d'usage revendiqué : un trail de ~1 000 participants jusqu'à 105 km en Autriche.
- Prix constatés (indicatifs, site NL) : **320 € la location, 2 890 € l'achat, par coffret de 2 boîtiers**.
- **C'est la seule famille RFID qui réponde vraiment au checkpoint isolé.** Mais : la SIM 4G ne sert à rien en zone blanche (les données restent stockées localement), le froid d'un départ à l'aube en montagne ampute l'autonomie annoncée, et il faut importer le matériel en Algérie (§ 4).

---

## 3. Chiffrage pour Ait-Aissi 2027 (1 000 coureurs)

Prix constatés en ligne, **à confirmer par devis** — plusieurs sources datent de plusieurs mois à plusieurs années, et les tarifs varient fortement selon le revendeur.

### Consommables (par édition)

| Poste | Prix unitaire constaté | Pour 1 000 coureurs |
|---|---|---|
| Dossard A5 avec puce intégrée (RACE RESULT) | 1,42 – 1,68 € | **1 420 – 1 680 €** |
| Puce dossard UHF seule, en gros (fabricant Asie) | 0,23 – 0,35 $ (lots ≥ 1 000) | **230 – 350 $** |
| Puce lacet / dossard (fournisseur Inde) | ~25–30 ₹ + GST (min. 500 pcs) | **≈ 280 – 350 €** |

→ Le consommable n'est **pas** le point bloquant : ~300 à 1 700 € par édition, soit **0,3 à 1,7 € par coureur**, absorbable par les frais d'inscription.

### Matériel (investissement unique)

| Scénario | Composition | Coût estimé |
|---|---|---|
| **A — Montage « DIY »** | Lecteur 4 ports (Impinj R700 ~1 400–1 670 $, ou Zebra FX9600 4 ports ~1 340 $) + 4 antennes panneau ~150 $ pièce + câbles faible perte ~100–200 $ + trépieds/fixations | **≈ 2 500 – 3 000 $** matériel |
| | Logiciel de chronométrage (pas d'open source identifié sur ce créneau ; licence type ~900 $ une fois) | **+ ≈ 900 $** |
| | Station d'énergie portable + PC terrain | **+ ≈ 500 – 800 €** |
| **B — Boîtiers autonomes** | Track Box Passive, coffret de 2 | **2 890 € achat / 320 € location** |
| **C — Système clé en main pro** | Décodeur + antenne sol + support éditeur | ordre de grandeur **3 800 $+** le décodeur seul ; packs annoncés à plusieurs milliers |

**Ordre de grandeur pour équiper départ + arrivée en RFID passif, scénario A (le moins cher) :**
≈ **3 400 – 3 900 $ de matériel et logiciel** (soit grossièrement **3 200 – 3 700 €**), **+ 300 à 1 700 € de puces par édition**.

Conversion DZD indicative, à ajuster au taux du jour et au canal de change retenu : **au taux officiel (~150 DZD/€)** ≈ 480 000 – 555 000 DZD d'investissement ; **au taux du marché parallèle (~260 DZD/€)** ≈ 830 000 – 960 000 DZD. L'écart entre les deux taux est, à lui seul, aussi grand que le reste de l'analyse — il doit être tranché avant tout engagement.

---

## 4. Les quatre blocages non financiers (les vrais)

Le prix n'est que le quatrième problème. Par ordre de gravité :

1. **Réglementaire / import.** Un lecteur UHF est un **émetteur radio**. Son importation et son exploitation en Algérie relèvent d'une autorisation de l'ARPCE, et la bande autorisée doit être vérifiée : l'Europe émet en 865–868 MHz, l'Amérique du Nord en 902–928 MHz — acheter du matériel « US » qui ne serait pas autorisé localement rend l'investissement inutilisable. **À vérifier auprès de l'ARPCE avant tout achat. C'est le point n°1 : il peut annuler l'option à lui seul.**
2. **Compétence et maintenance.** Un portique RFID se règle (puissance, orientation, seuils, filtrage des doubles lectures). Mal réglé, il lit les coureurs qui ne sont pas encore passés, ou rate ceux qui passent collés. Une équipe bénévole sans prestataire absorbe cette courbe d'apprentissage le jour J, sur un poste critique et non rejouable.
3. **Énergie et portage sur checkpoint.** Chaque poste RFID isolé = lecteur + antennes + trépieds + batterie, à porter en montagne, à protéger de la pluie, à surveiller. Un téléphone avec l'app Azzel pèse 200 g et tient la journée.
4. **Coût.** Réel mais le plus soluble : amortissable sur plusieurs éditions et refacturable aux organisateurs locataires d'instances (cf. modèle de location par événement du brief).

---

## 5. Ce que le RFID apporterait réellement à Azzel

À être honnête sur la valeur : le RFID **ne résout pas** le problème que l'épopée 4 résout déjà bien (relever des passages hors réseau). Il résout deux problèmes que le QR ne résout pas :

| Problème | QR (solution actuelle) | RFID passif |
|---|---|---|
| **Départ en masse de 1 000 coureurs** | Impossible à scanner : le brief contourne par départs échelonnés + heure officielle serveur | Résolu nativement (lecture de masse) |
| **Arrivée au coude-à-coude** | Risque d'inversion d'ordre entre deux coureurs à la seconde | Résolu (horodatage au centième) |
| Relevé checkpoint isolé | Résolu (1 bénévole, 1 téléphone, hors-ligne) | Résolu mais 10× plus lourd |
| Retrait des dossards au guichet | Résolu, voyant doublon | Équivalent |
| Coût par édition | ≈ 0 | 300 – 1 700 € de puces |

**Autrement dit, le RFID est un investissement de confort sur 2 points de la course, pas un prérequis du produit.** La décision d'architecture AD-3 (heures de départ officielles côté serveur, scan = contrôle de présence et non référence horaire) a déjà neutralisé le premier des deux problèmes.

---

## 6. Scénarios de décision

### Scénario 0 — Statu quo QR *(recommandé pour le 26 mars 2027)*
Aucun matériel. On exécute l'épopée 4 telle que spécifiée.
- **Coût :** 0. **Risque :** faible, déjà spécifié et recetté.
- **À renforcer :** filet de sécurité à l'arrivée — caméra fixe horodatée sur la ligne, synchronisée à la même référence horaire que les appareils, consultable a posteriori en cas de litige de classement. Coût marginal, gain d'auditabilité réel.

### Scénario 1 — Hybride RFID départ/arrivée seulement *(cible V2, édition 2028)*
RFID uniquement sur la base de vie (secteur alimenté, bénévoles nombreux, matériel non porté), QR maintenu sur tous les checkpoints.
- **Coût :** ≈ 3 200 – 3 700 € une fois + 300 – 1 700 €/édition.
- **Prérequis absolu :** autorisation ARPCE confirmée (§ 4.1).
- **Prérequis produit :** contrat « source de passage » dans `shared` (§ 7).
- **Amortissement :** réutilisable à chaque édition et louable avec l'instance Azzel à d'autres organisateurs — c'est le scénario qui a un sens économique dans le modèle du brief.

### Scénario 2 — Location de boîtiers autonomes pour une édition
Location de Track Box (≈ 320 € le coffret de 2) pour tester sans investir.
- **Avantage :** test grandeur nature à coût contenu.
- **Blocage :** importation temporaire de matériel radio + dédouanement sur un calendrier de course non négociable. Risque opérationnel élevé pour un bénéfice de test.

### Scénario 3 — Prestataire de chronométrage
Hors sujet dans le contexte algérien actuel (aucune offre locale identifiée à ce stade — **à vérifier localement** : fédération d'athlétisme, organisateurs de marathons algérois), et contraire au positionnement « coût d'exploitation proche de zéro, outil offert à l'organisateur ».

---

## 7. Action à faire dès maintenant (coût : quelques heures)

Indépendamment de la décision matérielle, rendre l'épopée 4 **agnostique du capteur** pendant qu'elle est encore en cours d'écriture :

- Dans `packages/shared`, la clé naturelle d'un Passage est déjà `(édition, coureur, checkpoint)` — correcte et déjà indépendante du capteur (AD-6, AD-8).
- Ajouter au contrat un champ de **provenance** sur l'événement de passage : `source: 'qr-scan' | 'rfid' | 'manual'`, plus un identifiant d'appareil producteur. Aucun impact sur la V1, qui n'émet que `qr-scan`.
- Conséquence : un lecteur RFID devient en V2 **un producteur de plus dans la même outbox**, soumis au même arbitrage serveur (premier passage reçu fait foi, suivants archivés — AD-3). Aucune réécriture de l'épopée 4, aucune dette.
- Côté admin (épopée 5), le journal de sync et l'annulation auditable couvrent déjà le cas d'un capteur qui produit des lectures parasites — un besoin que le RFID rendra *plus* fréquent que le QR.

**À vérifier avant toute décision d'achat, par ordre :**
1. ☐ Bande UHF autorisée et procédure d'autorisation ARPCE pour un lecteur RFID en Algérie.
2. ☐ Faisabilité et coût réel du dédouanement d'un lecteur + antennes.
3. ☐ Existence d'un fournisseur ou prestataire RFID en Algérie (achat local = pas d'import).
4. ☐ Devis fermes : lecteur 4 ports, 4 antennes, licence logicielle compatible, 1 000 puces.
5. ☐ Taux et canal de change retenus pour l'achat.

---

## 8. Sources

Prix et caractéristiques relevés le 2026-11-02. Plusieurs pages sont datées de plusieurs mois à plusieurs années : **tous les chiffres sont indicatifs et à confirmer par devis**.

- [RACE RESULT — Track Box Passive](https://www.raceresult.com/en/solutions/trackingpassive) — boîtier autonome checkpoint, autonomie, GPS/4G/solaire
- [RACE RESULT — Transpondeurs actifs (tarifs publics)](https://www.raceresult.com/en-ro/shop/ActiveTransponders.php) — 45 € HT à l'unité, 21 € HT à 5 000+
- [RACE RESULT — Solution trail](https://www.raceresult.com/en-us/solutions/trailrun)
- [RACE RESULT — Decoder 5000S](https://www.raceresult.com/en/systems/decoder)
- [MYLAPS — chronométrage running](https://mylaps.com/active-sports/sports/running/) — BibTag, UHF passif
- [Race Directors HQ — How to Build an RFID Race Timing System](https://www.racedirectorshq.com/read/build-rfid-race-timing-system-20/) — montage DIY ~2 750 $
- [Agee Race Timing — package FX9600 (PDF)](http://www.ageeracetiming.com/resources/AgeeRaceTiming_FX9600Package.pdf) — détail antennes/câbles/logiciel
- [Webscorer — Recommended RFID timing hardware setup](https://www.webscorer.com/blog/post/RECOMMENDED-RFID-TIMING-HARDWARE-SETUP)
- [Gateway RFID Store — Impinj R700](https://gatewayrfidstore.com/shop/impinj-r700-rain-uhf-rfid-reader/) — ~1 399–1 671 $
- [Atlas RFID Store — Zebra FX9600](https://www.atlasrfidstore.com/zebra-fx9600-rfid-reader-8-port/)
- [Atlas RFID Store — RFID race timing](https://www.atlasrfidstore.com/rfid-race-timing/)
- [India RFID Store — RFID race timing system](https://www.indiarfidstore.com/rfid-race-timing-system) — puces ~25–30 ₹
- [Made-in-China — puces dossard UHF Monza R6](https://geechintechnology.en.made-in-china.com/product/AERYmLMbIPrw/China-Printable-UHF-RFID-Bibtag-Timing-Chip-Impinj-Monza-R6-High-Sensitivity-Long-Range-5-10m-for-Race-Timing-System-Cycling-Trail-Run.html) — 0,23–0,35 $ en gros
- [Chrono Trail (FR) — LiveTrack](https://chrono-trail.fr/technologie) — balises GPS autonomes, alternative non-RFID
- [Point course — système de chronométrage complet](https://pointcourse.com/produit/vente-systeme-de-chronometrage-complet/) — kit tapis + lecteur sur batterie
- [Trakmy — géolocalisation du matériel en montagne](https://trakmy.fr/geolocalisation-materiel-montagne/) — froid, zones blanches, relief
