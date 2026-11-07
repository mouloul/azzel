# Scénarios de recette — Épopée 4 : Chronométrage offline & e-dossard

**Produit :** Azzel · **Périmètre :** stories 4-1 → 4-5 · **Date :** 2026-10-23 · **Révision :** 2026-11-03 (story 10.1 : CTA et bandeau sync de la PWA volontaires refondus — libellé « ◷ N passages en attente », pilules du socle ; pas de pas supprimé)
**Durée estimée :** 75–100 min (module par module, arrêt/reprise possible)

Chaque module se teste indépendamment : cochez au fur et à mesure et notez les écarts dans la colonne Observations du tableau final. Aucune connaissance du code n'est requise. S1 à S4 de la recette épopée 3 sont un prérequis (volontaire importé, missions, annuaire chargé).

---

## 0. Préparation de l'environnement (5 min)

```bash
bash scripts/dev-db.sh up        # Postgres 54329
bash scripts/dev-mail.sh up      # faux SMTP — UI http://localhost:8026
pnpm -F @azzel/web db:migrate    # 0001–0025
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web   # http://localhost:3000
```

**Prérequis données :**
- [ ] Un coureur avec dossier **validé** (recette épopée 1 S6)
- [ ] Dossards attribués (`/admin/dossiers` → « Attribuer les dossards »)
- [ ] Un volontaire avec une mission **Scan checkpoint** ET/OU **Distribution des dossards** affectée (`/admin/missions`)

**Astuce :** pour scanner un vrai QR sans second téléphone, affichez l'e-dossard du coureur sur l'écran de l'ordinateur et visez-le avec la caméra du téléphone du volontaire.

---

## S1 — E-dossard QR hors-ligne (story 4-1)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Coureur validé → `/espace-coureur` | Bandeau « Dossier validé » + lien « Ton e-dossard — QR à présenter au guichet » |
| 1.2 | Ouvrir l'e-dossard | Carte sombre : nom, épreuve, numéro 74 px, badge « HORS-LIGNE PRÊT » (mono) ; QR sur carte blanche coins arrondis ; conseil écran d'accueil |
| 1.3 | Scanner le QR avec l'appareil photo d'UN AUTRE téléphone | La chaîne `azzel-e1:…` s'affiche — JAMAIS le numéro de dossard seul |
| 1.4 | DevTools → Network → **Offline**, recharger | La page se recharge depuis le cache, QR et numéro intacts |
| 1.5 | Coureur non numéroté (avant attribution) | « Numéro à venir » + note « ton QR fonctionne déjà » |
| 1.6 | Dossier non validé (autre coureur) | « Ton e-dossard arrive » + lien checklist, AUCUN QR |
| 1.7 | Déconnexion coureur puis reconnexion | Même QR (jeton créé une fois, jamais régénéré) ; DevTools → Application → Cache Storage : caches `az-coureur-*` purgés au logout |

## S2 — Moteur de scan caméra (story 4-2)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Volontaire avec mission scan → `/volontaires` | Gros bouton en pilule « Démarrer le scan » avec le titre de sa mission (section « Scan des e-dossards », ou « Retrait des dossards » si le volontaire n'a que la mission guichet) |
| 2.2 | Volontaire SANS mission scan | PAS de bouton scan (le scan reste une mission parmi d'autres) |
| 2.3 | Ouvrir le scanner, refuser la caméra | Écran « Autoriser la caméra » : chemins Réglages iPhone ET Android complets + bouton « Appeler le PC » |
| 2.4 | Autoriser puis « Démarrer le scan » | Caméra plein écran, voile sombre, badges « · LIVE » + heure + mission, annonce « caméra active · annuaire chargé » |
| 2.5 | Scanner le QR d'un coureur connu | Voyant vert « ✓ Passage enregistré — dossard N · HH:MM:SS » + bip succès + vibration, < 1 s |
| 2.6 | Re-scanner le même coureur (même checkpoint) | Voyant « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS » + bip doublon DISTINCT |
| 2.7 | Scanner un QR quelconque (pas un e-dossard) | Voyant rouge bas d'écran « ⚠ DOSSARD INCONNU — revérifier » + bouton « Appeler le PC » + bip inconnu |
| 2.8 | DevTools → Offline PUIS scanner | Tout fonctionne à l'identique (validation 100 % locale) |
| 2.9 | Bouton « Arrêter le scan » | Retour à la fiche, caméra libérée (le point caméra s'éteint) |

## S3 — Scan de retrait au guichet (story 4-3)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | Volontaire avec mission Distribution des dossards → `/volontaires` | Bouton « Scan retrait » avec le titre de sa mission |
| 3.2 | Scanner un coureur | « ✓ Dossard N — {prénom} · présent au départ » + bip succès |
| 3.3 | Re-scanner le même coureur | « ↻ DÉJÀ PASSÉ — retiré à HH:MM:SS » — aucun double enregistrement |
| 3.4 | Se déconnecter puis se reconnecter, re-scanner | TOUJOURS doublon (dédoublonnage persistant cross-session) |
| 3.5 | DevTools → Application → IndexedDB → `azzel-volontaires` → store `outbox` | Un enregistrement `retrait:v1:…` par coureur retiré |
| 3.6 | Se déconnecter | IndexedDB : stores fiche/annuaire vidés, `outbox` et `appareil` CONSERVÉS |
| 3.7 | Volontaire SANS mission guichet → URL directe `/volontaires/scan?mode=retrait` | Retour à la fiche avec message « réservé aux volontaires avec une mission Distribution… » |

## S4 — Passages aux checkpoints (story 4-4)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | Volontaire scan → scanner un coureur (première fois à ce checkpoint) | « ✓ Passage enregistré — dossard N · HH:MM:SS » |
| 4.2 | Le volontaire d'un AUTRE poste (autre mission scan) scanne le MÊME coureur | NOUVEAU succès (passage distinct — l'arbitrage entre postes se fait au serveur) |
| 4.3 | IndexedDB → `outbox` | Clés `passage:v1:…` distinctes par coureur × checkpoint, cohabitant avec les retraits |
| 4.4 | Volontaire SANS mission scan → URL directe `/volontaires/scan` | Retour à la fiche avec message dédié « le checkpoint identifie chaque passage » |

## S5 — Synchronisation par lots (story 4-5)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 5.1 | Scanner plusieurs passages/retraits en **offline** (DevTools) | Bandeau sync sur la fiche : « ◷ N passages en attente » (compteur exact) |
| 5.2 | Repasser **Online** | La sync part seule : « ⏳ Envoi en cours — N en attente » → « ✓ envoyés — file : 0 » |
| 5.3 | Ouvrir le « Journal sync » (details) | Lots horodatés : « N envoyés · M déjà connus · K rejetés », motif des rejets, « horloge appareil : ±X s vs serveur » |
| 5.4 | Re-scanner hors-ligne puis resynchroniser | Compteur repart puis retombe à 0 ; (psql) `SELECT count(*) FROM terrain_evenement` — aucun doublon (clés uniques) |
| 5.5 | `bash scripts/dev-db.sh psql -c "select type, jeton_coureur, checkpoint_id, offset_estime_ms from terrain_evenement order by horodatage_reception"` | Retraits (checkpoint NULL) et passages (checkpoint rempli) reçus, offsets journalisés |
| 5.6 | Deux postes scannent le MÊME coureur au MÊME checkpoint puis synchronisent | (psql) deux lignes ; la PREMIÈRE reçue fait foi — la seconde archivée, neutre |
| 5.7 | `/admin/appareils` | L'appareil listé (dernière sync visible) |
| 5.8 | Révoquer l'appareil puis tenter « Envoyer maintenant » | Bandeau « ⚠ Appareil bloqué par le PC » + lien « Appelle le PC » — plus de bouton d'envoi |
| 5.9 | Déconnexion volontaire AVEC événements en file, réseau actif | La sync continue de fonctionner (canal appareil indépendant de la session) — la file se vide quand même |
| 5.10 | Couper le réseau PENDANT un envoi | Bandeau conserve « ◷ N en attente », rien de perdu, retry au prochain online |

---

## S6 — Résolution non ambiguë du checkpoint (story 4-6)

Ce module vérifie que le système **refuse de deviner** à quel point de contrôle
rattacher un passage. À passer après S2 (le scanner fonctionne).

**Préparation** : un volontaire de test, connecté sur un téléphone ou un second
navigateur ; l'organisateur sur `/admin/missions`.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 6.1 | Organisateur : affecter le volontaire à **une seule** mission « Scan checkpoint », horaires 9h–12h. Volontaire : ouvrir `/volontaires` à n'importe quelle heure | Entrée « Démarrer le scan » visible, libellé = titre de la mission. Le scanner s'ouvre, **même hors des horaires** (non-régression : une seule mission n'est jamais ambiguë) |
| 6.2 | Affecter en plus une **deuxième** mission scan, horaires 16h–18h. Volontaire : recharger `/volontaires` puis ouvrir le scanner, **en dehors** des deux créneaux et à plus d'une heure de chacun | Écran « **Aucune mission de scan en cours** ». Les **deux** missions sont listées avec leurs horaires. Boutons « Appeler le PC » et « Revenir à ma fiche » présents |
| 6.3 | Sur la fiche, regarder l'entrée « Démarrer le scan » | Toujours visible — le volontaire a bien une mission — mais le libellé indique « créneau à vérifier » |
| 6.4 | Organisateur : modifier la première mission pour que son créneau **couvre l'heure actuelle**. Volontaire : recharger le scanner | Le scanner s'ouvre, badge du cadre caméra = titre de cette mission |
| 6.5 | Organisateur : modifier la **seconde** mission pour qu'elle couvre AUSSI l'heure actuelle (l'avertissement de chevauchement s'affiche à l'affectation — l'ignorer). Volontaire : recharger le scanner | Écran « **Deux missions se chevauchent sur ce créneau** », les deux missions nommées avec leurs horaires, « Appeler le PC » présent. **Aucun scan possible** |
| 6.6 | Organisateur : supprimer l'une des deux missions. Volontaire : recharger | Le scanner s'ouvre sur la mission restante |
| 6.7 | Débordement : régler une mission unique sur un créneau **terminé depuis moins d'une heure**, l'autre supprimée | Le scanner s'ouvre (tolérance de 60 min — le dernier coureur n'est pas perdu) |
| 6.8 | Même chose avec un créneau terminé depuis **plus de deux heures**, en gardant deux missions scan | Écran « Aucune mission de scan en cours » |
| 6.9 | Mode retrait : affecter deux missions « Distribution des dossards » sur le même créneau, ouvrir `/volontaires/scan?mode=retrait` | Même écran de chevauchement — la règle vaut pour les deux scanners |
| 6.10 | Mixte : une mission guichet 8h–10h **et** une mission scan 9h–12h (elles se chevauchent). Ouvrir les deux scanners | **Aucun blocage** : chaque scanner ouvre sur SA mission. Le chevauchement entre familles différentes est normal |
| 6.11 | Sur mobile, écran de blocage affiché | Les deux boutons sont cliquables au doigt, le texte entier est lisible sans zoom |

---

## S7 — Scanner depuis la poche, base muette (story 4-7)

Vérifie que le scan survit à une base de données injoignable **avec le réseau
actif** — le cas d'un serveur sous charge le jour J. À passer après S2 et S6.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 7.1 | Volontaire avec une mission scan : ouvrir `/volontaires` **en ligne**, puis `/volontaires/scan`, laisser le scanner atteindre « Scanner les e-dossards » | Fonctionnement normal, **aucun** bandeau de fraîcheur |
| 7.2 | Couper la base en gardant le réseau : `docker stop azzel-postgres`. Recharger `/volontaires/scan` | Le scanner se rend quand même. Bandeau **« Serveur injoignable — checkpoint repris de ta fiche du JJ/MM à HH:MM »** avec le rappel d'appeler le PC en cas de réaffectation |
| 7.3 | Démarrer le scan et scanner un e-dossard | Voyant et bip normaux : « ✓ Passage enregistré ». Le compteur du bandeau sync monte |
| 7.4 | Relancer la base : `docker start azzel-postgres`, attendre 10 s, revenir sur `/volontaires` | Le bandeau sync vide la file. En base : `select checkpoint_id from passage order by created_at desc limit 1` — **l'identifiant de la bonne mission** |
| 7.5 | Recharger `/volontaires/scan` base relancée | Plus de bandeau de fraîcheur : le serveur a repris la main |
| 7.6 | Purger la poche (DevTools → Application → IndexedDB → supprimer `azzel-volontaires`), couper la base, ouvrir `/volontaires/scan` | Écran **« Mission introuvable sur cet appareil »** + « Appeler le PC » + « Revenir à ma fiche ». **Aucun scan possible** |
| 7.7 | Base coupée, poche garnie avec **deux** missions scan hors créneau (cf. S6) | Écran « Aucune mission de scan en cours » — les blocages de 4.6 s'appliquent à l'identique depuis la poche |
| 7.8 | Base coupée, mode retrait : `/volontaires/scan?mode=retrait` | Même comportement, surtitre « Retrait des dossards » |
| 7.9 | Hors-ligne **total** (DevTools → Offline), base coupée aussi | Le service worker ressert la page en cache : inchangé par rapport à S2 |

---

## Tableau de synthèse

| Module | Story | Statut | Observations |
|--------|-------|--------|--------------|
| S1 — E-dossard QR hors-ligne | 4-1 | ☐ ☐ ☐ | |
| S2 — Moteur de scan caméra | 4-2 | ☐ ☐ ☐ | |
| S3 — Scan de retrait | 4-3 | ☐ ☐ ☐ | |
| S4 — Passages checkpoints | 4-4 | ☐ ☐ ☐ | |
| S5 — Sync par lots | 4-5 | ☐ ☐ ☐ | |
| S6 — Résolution non ambiguë du checkpoint | 4-6 | ☐ ☐ ☐ | |
| S7 — Scanner depuis la poche, base muette | 4-7 | ☐ ☐ ☐ | |

**Légende :** ☐ à cocher — tests passés / anomalies mineures / bloquantes. Toute anomalie bloquante : la noter avec le numéro d'étape (ex. « 2.7 : voyant inconnu sans bip ») et préserver l'environnement (ne pas purger IndexedDB ni la base).
