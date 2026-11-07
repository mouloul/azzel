# Plan de recette — application volontaire (épopées 3 et 4)

**Objet :** vérifier sur écran ce qui n'a été prouvé que par des tests automatiques.
**Date :** 2026-11-07 · **Périmètre :** stories 3.1 → 3.5 et 4.1 → 4.7
**Durée totale :** 2 h 30 à 3 h, découpable en trois séances indépendantes.

Ce document **séquence** les modules de recette existants, il ne les remplace pas.
Les étapes détaillées vivent dans :

- `scenarios-recette-epic-3.md` — modules S1 à S5
- `scenarios-recette-epic-4.md` — modules S1 à S7

---

## Les quatre règles

1. **Une anomalie se note, elle ne se répare pas.** Numéro du module et de l'étape
   (« 4-S6.5 »), ce que tu attendais, ce que tu as vu. Capture d'écran si c'est visuel.
2. **Ne purge rien après une anomalie bloquante.** Ni IndexedDB, ni la base, ni le
   cache. L'état au moment du défaut est la moitié du diagnostic.
3. **Avance même après un échec non bloquant.** Un module raté n'empêche pas le
   suivant, sauf mention explicite dans le tableau des dépendances.
4. **Ce que tu ne peux pas tester, écris-le.** « Pas d'iPhone sous la main » est une
   information utile, pas un aveu.

---

## Étape 0 — Environnement (15 min, une seule fois)

```bash
cd ~/Desktop/ouidou/Azzel
git checkout main
git pull --ff-only

bash scripts/dev-db.sh up        # Postgres sur le port 54329, crée/migre .env
bash scripts/dev-mail.sh up      # faux serveur mail, interface sur :8026
pnpm -F @azzel/web db:migrate    # applique toutes les migrations
pnpm -F @azzel/web seed          # coureurs, dossards, volontaires, missions
```

Le seed affiche un rapport. **Note les chiffres**, ils servent de référence :

```
Coureurs fictifs : N créé(s)…
Dossards attribués : N.
Volontaires : N créé(s).
Terrain : N secteur(s), N mission(s), N affectation(s).
```

Puis, dans un terminal que tu laisses ouvert :

```bash
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web
```

**Vérifications avant de commencer :**

- [ ] `http://localhost:3000` affiche l'accueil
- [ ] `http://localhost:8026` affiche Mailpit (boîte vide ou presque)
- [ ] Connexion en organisateur : `/connexion`, email `orga@example.dz`, le code
      arrive dans Mailpit, tu atterris sur `/admin`
- [ ] `/admin/volontaires` liste les volontaires créés par le seed
- [ ] `/admin/missions` liste les secteurs et missions

Si l'une de ces cases ne se coche pas, **arrête-toi** : la suite n'aurait aucun sens.
Note laquelle et ce que tu as vu.

---

## Séance 1 — Organisation, au poste de travail (50 min)

Navigateur seul, aucun téléphone nécessaire. Tu es l'organisateur.

| Ordre | Module | Où | Ce qu'on vérifie | Durée |
|---|---|---|---|---|
| 1 | **3-S1** | epic-3 | Import Excel, rapport ligne par ligne, invitations dans Mailpit, connexion par code | 15 min |
| 2 | **3-S5** | epic-3 | Correction d'une adresse mal saisie, suppression d'un volontaire, adresse libérée | 15 min |
| 3 | **3-S2** | epic-3 | Secteurs, missions typées, couverture, avertissement de chevauchement | 20 min |

**Attention sur 3-S1** : le seed a déjà créé des volontaires. Pour l'import, utilise des
adresses qui n'existent pas encore (`test1@exemple.dz`, `test2@exemple.dz`…), sinon tu
obtiendras des lignes « Ignoré — déjà volontaire », ce qui est le bon comportement mais
pas celui que le module décrit.

**3-S5 est le plus neuf** : ces écrans ont été écrits aujourd'hui et n'ont **jamais** été
vus. C'est là que je m'attends au plus de surprises. Les étapes 5.8 à 5.10 (adresse déjà
prise, adresse réservée, champ vide) sont les plus susceptibles de révéler un libellé
maladroit ou un focus mal placé.

---

## Séance 2 — Terrain, avec un téléphone (60 min)

L'application doit être servie en **HTTPS** : caméra, service worker et installation
PWA exigent tous un contexte sécurisé. Une IP locale en HTTP ne suffit pas — c'est une
règle du navigateur, pas un défaut du produit.

### Monter le tunnel (ngrok)

```bash
# terminal 1 — l'application, déjà lancée depuis l'étape 0
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web

# terminal 2 — le tunnel
ngrok http 3000
```

ngrok affiche une ligne `Forwarding  https://xxxx.ngrok-free.app -> http://localhost:3000`.
C'est cette adresse **https** que tu ouvres sur le téléphone.

`next.config.ts` autorise déjà les domaines ngrok et Cloudflare Tunnel
(`allowedDevOrigins`) : sans cette entrée, Next refuserait les requêtes du tunnel.

### Quatre choses à savoir, elles vont te coûter du temps sinon

1. **Ne redémarre pas ngrok au milieu d'une séance.** En version gratuite, l'adresse
   change à chaque lancement — et pour le navigateur, une nouvelle adresse est un
   **site différent** : poche IndexedDB vide, service worker à réinstaller, PWA à
   réinstaller. Les modules 3-S3, 3-S4 et 4-S7 reposent justement sur la poche. Si tu
   dois couper, prévois de reprendre la séance au début.
2. **Première visite : ngrok affiche une page d'avertissement.** Clique « Visit Site ».
   Elle ne polluera pas le cache hors-ligne — c'est précisément ce que le correctif de
   marqueur livré aujourd'hui empêche.
3. **Mailpit reste sur ton poste** (`http://localhost:8026`). Les codes de connexion
   s'y lisent depuis le portable, pas depuis le téléphone. Ouvre les deux côte à côte.
4. **La latence du tunnel ne fausse PAS la mesure clé.** Les pages chargeront plus
   lentement, mais la confirmation du scan est entièrement locale — annuaire et boîte
   d'envoi en IndexedDB, zéro réseau. Le « moins d'une seconde » du module 4-S2 reste
   mesurable tel quel.

### Si ngrok n'est pas disponible

Replis, par ordre de fidélité décroissante : un tunnel Cloudflare
(`cloudflared tunnel --url http://localhost:3000`, également autorisé dans la config),
ou le flag Chrome Android `chrome://flags` → *Insecure origins treated as secure* →
ajouter `http://192.168.x.x:3000`. Le flag débloque la caméra mais **pas** le service
worker ni l'installation PWA : les modules hors-ligne deviennent intestables.

Note dans le relevé la méthode retenue : elle change la portée de tes observations.

| Ordre | Module | Où | Ce qu'on vérifie | Durée |
|---|---|---|---|---|
| 4 | **3-S3** | epic-3 | Fiche mission hors-ligne, installation PWA, mode sombre | 15 min |
| 5 | **3-S4** | epic-3 | Préchargement de l'annuaire, badge « Annuaire prêt — N coureurs » | 10 min |
| 6 | **4-S1** | epic-4 | E-dossard QR côté coureur, lisible hors-ligne | 10 min |
| 7 | **4-S2** | epic-4 | Moteur de scan, trois voyants, permission caméra | 15 min |
| 8 | **4-S3** | epic-4 | Scan de retrait au guichet, voyant doublon | 10 min |

**Le point de vérité de cette séance** : à l'étape 4-S2, la confirmation doit tomber en
**moins d'une seconde** — bip, voyant, vibration. Si tu sens un délai, c'est un défaut
majeur, note-le même si tout le reste passe. C'est la promesse centrale du produit et
aucun test automatique ne peut la mesurer.

---

## Séance 3 — Chronométrage et cas limites (55 min)

Reprend là où la séance 2 s'arrête, même téléphone.

| Ordre | Module | Où | Ce qu'on vérifie | Durée |
|---|---|---|---|---|
| 9 | **4-S4** | epic-4 | Passages aux checkpoints, doublon, dossard inconnu | 15 min |
| 10 | **4-S5** | epic-4 | Synchronisation par lots, journal, zéro passage perdu | 15 min |
| 11 | **4-S6** | epic-4 | Résolution du checkpoint : creux, chevauchement, débordement | 15 min |
| 12 | **4-S7** | epic-4 | Scanner depuis la poche, base coupée réseau actif | 10 min |

**4-S6 et 4-S7 sont les deux modules écrits aujourd'hui.** Jamais vus non plus.

Pour **4-S7**, la coupure de base se fait ainsi, et se répare pareil :

```bash
docker stop azzel-postgres     # couper
docker start azzel-postgres    # relancer, attendre ~10 s
```

Garde le réseau Wi-Fi **actif** pendant la coupure : c'est tout l'intérêt du module.
Couper le Wi-Fi testerait le hors-ligne, qui est déjà couvert par 4-S2.

---

## Dépendances — ce qui bloque quoi

| Si ce module échoue… | …ceux-ci n'ont plus de sens |
|---|---|
| **Étape 0** (environnement) | tout |
| **3-S1** (import, connexion par code) | 3-S3, 3-S5, et toute la séance 2 |
| **3-S2** (secteurs et missions) | 3-S3, 4-S2, 4-S3, 4-S4, 4-S6, 4-S7 |
| **3-S4** (annuaire préchargé) | 4-S2, 4-S3, 4-S4 — le scan valide contre l'annuaire |
| **4-S2** (moteur de scan) | 4-S3, 4-S4, 4-S5 |

Tout le reste est indépendant : un échec n'arrête pas la séance.

---

## Ce que cette recette ne couvrira pas

À dire franchement, pour que personne ne croie le contraire après coup :

- **La tenue en charge.** 700 retraits en deux heures, 200 volontaires connectés
  simultanément : rien de ce plan ne l'approche.
- **Un vrai Android d'entrée de gamme.** Si tu testes sur un téléphone récent, la
  latence du scan ne dit rien de celle du terrain.
- **La zone blanche réelle.** Le mode avion simule une coupure nette ; un réseau qui
  tremble, s'accroche et retombe est un cas plus dur, et plus fréquent en montagne.
- **La durée.** Un e-dossard doit rester lisible après 30 jours de cache. Invérifiable
  en une après-midi.
- **Le soleil.** Les contrastes en plein jour, gants aux mains, ne se jugent pas
  derrière une fenêtre.

Ces cinq points relèvent d'un dry-run sur le terrain, pas d'une recette au bureau.

---

## Fiche de relevé

À remplir au fil de l'eau. Trois cases : ✅ passé · ⚠️ anomalie mineure · ❌ bloquant.

| # | Module | Statut | Anomalies (n° d'étape + ce que tu as vu) |
|---|--------|--------|------------------------------------------|
| 0 | Environnement | ☐ | |
| 1 | 3-S1 — Import et invitations | ☐ | |
| 2 | 3-S5 — Correction et suppression | ☐ | |
| 3 | 3-S2 — Secteurs et missions | ☐ | |
| 4 | 3-S3 — Fiche mission hors-ligne | ☐ | |
| 5 | 3-S4 — Annuaire des coureurs | ☐ | |
| 6 | 4-S1 — E-dossard QR | ☐ | |
| 7 | 4-S2 — Moteur de scan | ☐ | |
| 8 | 4-S3 — Scan de retrait | ☐ | |
| 9 | 4-S4 — Passages checkpoints | ☐ | |
| 10 | 4-S5 — Synchronisation | ☐ | |
| 11 | 4-S6 — Résolution du checkpoint | ☐ | |
| 12 | 4-S7 — Scanner depuis la poche | ☐ | |

**Appareil utilisé :** ………………………………
**Méthode d'accès** (ngrok / Cloudflare / flag Chrome / autre) : ………………………………
**Date et durée réelle :** ………………………………

---

## Après la recette

Rapporte-moi la fiche remplie, même partielle. Je trie : ce qui se corrige tout de
suite, ce qui mérite une story, ce qui part au registre des différés.

Les anomalies bloquantes passent avant la revue du groupe 2 — un défaut vu à l'écran
vaut dix constats de relecture.
