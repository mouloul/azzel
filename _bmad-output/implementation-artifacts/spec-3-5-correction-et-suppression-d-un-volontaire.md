# Spec 3.5 — Correction et suppression d'un volontaire

Épopée 3 — Armer les volontaires. Story ajoutée après clôture de 3.1–3.4, en
réponse à l'entrée différée de la revue 3.1 (2026-10-28) :

> Ni correction ni suppression d'un volontaire côté admin : un email mal saisi à
> l'import crée un compte fantôme permanent (invitation en file, liste admin) et
> bloque même un futur coureur sur cette adresse (« compte volontaire »).

Cible d'usage : **dry-run pré-course terrain**. L'organisation arme 150–200
volontaires par import Excel ; sur ce volume, les fautes de frappe d'adresse sont
certaines, et un volontaire se désengage avant le jour J. Sans correction ni
retrait, la liste admin dérive de la réalité du terrain et les missions affichent
une couverture fausse.

## Problème

Aujourd'hui `/admin/volontaires` n'offre que deux actions : importer un fichier
et renvoyer une invitation. Il en découle trois impasses :

1. **Adresse mal saisie** — `kahina@exmeple.dz` au lieu de `kahina@exemple.dz`.
   L'invitation partira dans le vide (ou chez un inconnu), la vraie Kahina ne
   pourra jamais se connecter, et un re-import avec la bonne adresse crée un
   **second** compte : deux lignes pour une personne.
2. **Adresse bloquée à vie** — le compte fantôme occupe `UNIQUE (organisation_id,
   email)` avec `role = 'volontaire'`. Si cette adresse est en réalité celle d'un
   futur coureur, son inscription est refusée (« un compte volontaire existe
   déjà », `store.importVolontaires`) sans qu'aucun écran ne permette de libérer
   l'adresse.
3. **Désengagement** — un volontaire qui se retire reste dans la liste et dans
   les compteurs ; ses missions apparaissent **couvertes** alors que personne ne
   viendra. La couverture étant dérivée des affectations (3.2), la seule façon de
   dire la vérité est de retirer le volontaire.

## Périmètre

Dans le périmètre :

- Modification d'un volontaire existant : nom, email, téléphone.
- Suppression d'un volontaire : fiche + compte, adresse libérée.
- Les deux actions depuis `/admin/volontaires`, réservées au rôle organisateur.

Hors périmètre :

- Création d'un volontaire à l'unité (l'import reste la porte d'entrée).
- Modification d'un compte coureur ou organisateur.
- Journal d'audit des modifications admin (aucun n'existe pour secteurs/missions
  non plus ; à spécifier globalement si l'exploitation le demande).

## Décisions

### D1 — Modifier l'email met à jour le compte, pas la fiche seule

`volontaire.nom` / `volontaire.telephone` vivent sur la fiche ; l'email vit sur
`account.email` (source unique, `UNIQUE (organisation_id, email)`). La
modification écrit donc dans les deux tables, dans **une** transaction.

### D2 — Email déjà pris → 409 champ, jamais d'écrasement

Collision sur `UNIQUE (organisation_id, email)` : refus explicite, erreur portée
par le champ `email`. L'adresse peut appartenir à un coureur, à un organisateur
ou à un autre volontaire — le message ne dit **pas** lequel (pas d'énumération
de comptes), il dit que l'adresse est prise.

### D3 — Adresse réservée à l'organisation → refus, même règle qu'à l'import

Une adresse de `AZZEL_ADMIN_EMAILS` serait promue organisateur à sa première
connexion. L'import la rejette déjà (`service.importVolontaires`) ; la
modification la rejette aussi, sinon la correction deviendrait la porte dérobée
que l'import ferme.

### D4 — Email corrigé sur un volontaire non activé → invitation remise en file

C'est le cas d'usage central : la correction n'a de valeur que si la vraie
personne reçoit son invitation. L'ancien email `pending`/`failed` passe
`cancelled` et un nouveau part sur la nouvelle adresse —
`mettreEnFileInvitation` fait déjà exactement cela (3.1), on le réutilise tel
quel.

Volontaire **déjà activé** : l'email est modifiable (changement d'adresse réel),
mais **aucune** invitation n'est remise en file — il se connecte déjà, lui
envoyer une invitation serait un faux signal. Son statut reste « Activé ».

Nom ou téléphone seuls modifiés : **aucun** email. Un email ne part que si
l'adresse change.

### D5 — Codes de connexion en vol sur l'ancienne adresse : invalidés

`login_code` est indexé par **email**, pas par compte. Après un changement
d'adresse, un code encore valide émis pour l'ancienne adresse ne doit plus
produire de session : `verifyCodeAndStartSession` ferait un
`INSERT … ON CONFLICT` et créerait un compte neuf (rôle `coureur` par défaut)
pour une adresse que l'organisation vient de détacher. On invalide donc les codes
non consommés de l'ancienne adresse. Idem à la suppression.

Les sessions **ne** sont **pas** révoquées au changement d'adresse : le compte ne
change pas, l'humain derrière non plus. À la suppression, la cascade
`session.account_id ON DELETE CASCADE` les supprime.

### D6 — Suppression refusée si le volontaire porte des affectations

Précédent maison : `SecteurOccupeError` (409) refuse de supprimer un secteur
portant des missions, plutôt que de cascader en silence. Même choix ici.
`affectation.volontaire_id` est en `ON DELETE CASCADE` : supprimer sans garde
viderait les missions et basculerait leur couverture de « couverte » à
« vacante » **sans que personne ne le voie** — exactement le mensonge
opérationnel que 3.2 cherche à éviter.

Le message nomme le nombre d'affectations ; l'organisateur les retire depuis
`/admin/missions`, puis supprime.

### D7 — Supprimer = fiche **et** compte, pour libérer l'adresse

Supprimer la seule fiche laisserait le compte `volontaire` occuper l'adresse :
le bug resterait entier. On supprime `account`, et `volontaire` suit par
`account_id ON DELETE CASCADE`. L'invitation `pending`/`failed` est annulée
d'abord : la file d'envoi ne doit pas expédier un email à une personne qu'on
vient de retirer. Les lignes `email_outbox` déjà `sent` restent (trace de ce qui
a réellement été envoyé) ; `volontaire.invitation_outbox_id` est en
`ON DELETE SET NULL`, aucune ligne outbox n'est détruite.

Une violation de clé étrangère résiduelle (compte référencé par une donnée de
course) est convertie en **409**, jamais en 500 : le refus doit être lisible.

### D8 — Confirmation explicite avant suppression

Action destructrice et irréversible : la liste demande une confirmation nommant
le volontaire (nom + email) avant d'appeler l'API. Aucune suppression sur un
simple clic.

## Critères d'acceptation

| ID | Critère |
|----|---------|
| AC1 | `PUT /api/admin/volontaires/{id}` modifie nom, email et téléphone d'un volontaire de l'organisation de la session. Validation réutilisée du domaine 3.1 : nom non vide ≤ 120, email valide ≤ 254, téléphone facultatif au `TELEPHONE_PATTERN`. Champs invalides → 400 avec erreurs **par champ**. |
| AC2 | Email déjà porté par un autre compte de l'organisation → 409, erreur sur le champ `email`, aucune écriture (D2). |
| AC3 | Email appartenant à `AZZEL_ADMIN_EMAILS` → 409 explicite « adresse réservée à l'organisation », aucune écriture (D3). |
| AC4 | Email changé sur un volontaire **non activé** → invitation remise en file sur la nouvelle adresse ; l'ancienne ligne outbox `pending`/`failed` passe `cancelled` (D4). La réponse indique qu'une invitation est repartie. |
| AC5 | Email changé sur un volontaire **activé** → aucune invitation en file, statut toujours « Activé » (D4). |
| AC6 | Nom et/ou téléphone modifiés sans changement d'email → aucune invitation en file (D4). |
| AC7 | Email changé → les `login_code` non consommés de l'**ancienne** adresse sont invalidés ; ceux de la nouvelle adresse ne sont pas touchés (D5). |
| AC8 | `DELETE /api/admin/volontaires/{id}` sur un volontaire sans affectation supprime fiche **et** compte : l'adresse est libre, un import ultérieur la crée à nouveau avec le statut « créé » (D7). |
| AC9 | Suppression d'un volontaire portant ≥ 1 affectation → 409 nommant le nombre d'affectations, rien n'est supprimé (D6). |
| AC10 | Suppression → invitation `pending`/`failed` annulée (aucun email ne part après coup) et sessions du compte supprimées par cascade (D7). |
| AC11 | Les deux routes exigent le rôle organisateur (`guardAdmin`) : session absente → 401, rôle coureur ou volontaire → 403. |
| AC12 | Un `id` d'une **autre** organisation → 404, jamais de fuite ni de modification (RLS + filtre explicite). Un `id` non-UUID → 404, jamais une 22P02 en 500. |
| AC13 | `/admin/volontaires` propose « Modifier » (formulaire pré-rempli, erreurs par champ) et « Supprimer » (confirmation nommant le volontaire, D8) sur chaque ligne. Succès `role="status"`, erreurs `role="alert"` — pattern 3.1. |
| AC14 | Cibles tactiles des deux actions ≥ 44 px (contrainte terrain de l'épopée 3), gap ≥ 8 px. |

## Plan de tests

**Unitaires** (`missions.test.ts` — sans base, store factice) :

- validation des champs de modification (nom/email/téléphone), erreurs par champ ;
- `id` non-UUID → `VolontaireNotFoundError` avant tout appel au store ;
- adresse réservée → refus sans appel au store ;
- mapping des nouvelles erreurs vers l'enveloppe API (statut, code, champ).

**Intégration** (`missions.integration.test.ts` — base `azzel_test`, rôle
`azzel_app`) :

- correction d'adresse d'un volontaire non activé : `account.email` à jour,
  ancienne outbox `cancelled`, nouvelle `pending` sur la bonne adresse ;
- collision d'adresse (coureur, organisateur, autre volontaire) → 409, aucune
  écriture ;
- volontaire activé : email modifié, zéro invitation en file ;
- nom/téléphone seuls : zéro invitation en file ;
- codes en vol de l'ancienne adresse invalidés, ceux de la nouvelle intacts ;
- suppression sans affectation : adresse réutilisable (import suivant → « créé »),
  sessions disparues, outbox `pending` passée `cancelled` ;
- suppression avec affectation → 409, volontaire et affectation toujours là ;
- isolation : un volontaire d'une autre organisation est introuvable.

**Routes** (`route.test.ts`) : 401 sans session, 403 hors rôle organisateur,
corps illisible → 400, succès → `{ ok: true }` avec `Cache-Control: no-store`.

## Fichiers touchés

- `apps/web/src/modules/missions/domain.ts` — validation du formulaire volontaire.
- `apps/web/src/modules/missions/errors.ts` — `VolontaireEmailPrisError`,
  `VolontaireEmailReserveError`, `VolontaireAffecteError`,
  `InvalidVolontaireFieldsError` + mapping API.
- `apps/web/src/modules/missions/service.ts` — `updateVolontaire`,
  `deleteVolontaire`.
- `apps/web/src/modules/missions/store.ts` — écritures transactionnelles.
- `apps/web/src/app/api/admin/volontaires/[id]/route.ts` — `PUT` / `DELETE`.
- `apps/web/src/app/admin/volontaires/volontaires-manager.tsx` — formulaire de
  modification, suppression confirmée.

Aucune migration : `account` et `volontaire` portent déjà les droits
`SELECT, INSERT, UPDATE, DELETE` pour `azzel_app` (0008, 0018) et la politique
RLS `FOR ALL` couvre `UPDATE` comme `DELETE`.
