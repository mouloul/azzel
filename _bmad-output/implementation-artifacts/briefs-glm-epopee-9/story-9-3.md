# Story 9.3 — Coquille de la section parcours sur l'accueil

Même projet, même branche `feat/refonte-design-epopees-9-10`, mêmes interdits que les stories
9.1 et 9.2 : aucune commande git en écriture, pas de `_bmad-output/`, pas d'édition manuelle
du CSS généré, aucune dépendance installée, aucun test existant désactivé ou supprimé.
Les stories 9.1 (socle) et 9.2 (accueil refondu) sont livrées et committées.

## Le but, et la limite

Le visiteur doit pouvoir comparer les deux épreuves depuis l'accueil, avec un sélecteur qui
bascule **toute** la section d'un seul geste. La carte 3D et le profil altimétrique ne sont
pas de cette story — ils arrivent à l'épopée 11. Tu livres la **coquille** : structure,
sélecteur, données réelles disponibles, et un emplacement annoncé pour la visualisation.

## Ce que tu dois découvrir avant de coder

Les données des épreuves existent déjà. Lis, dans l'ordre :

- `apps/web/src/modules/contenus/service.ts` — `EpreuveView` (`slug`, `nom`, `distanceKm`,
  `gpxUrl`) et `getParcoursPage()`
- `apps/web/src/app/parcours/page.tsx` — la page `/parcours` les consomme déjà
- `apps/web/src/modules/contenus/store.ts` — `EpreuveParcoursRecord`

**Tu ne crées pas une seconde source de vérité des épreuves.** Tu réutilises celle-là.

## La règle qui prime sur l'esthétique

**Aucun chiffre inventé sur une page publique.** La maquette montre D+, D−, plage d'altitude,
heure de départ et barrière horaire : ces valeurs viennent du POC de carte 3D, elles sont
**fictives**, et le tracé officiel 2027 n'existe pas encore. Tu n'écris donc dans le code
**aucune** de ces valeurs.

De plus, `page.test.tsx` interdit déjà la mention « à confirmer » et tout objectif 2027
chiffré sur l'accueil. Tu ne la contournes pas avec une formule équivalente.

Conséquence concrète : un champ dont la donnée n'existe pas **n'est pas affiché du tout**.
Pas de tiret, pas de « à venir », pas de valeur grisée. La section montre ce qu'on sait —
le nom de l'épreuve, sa distance, le lien vers le tracé GPX quand il existe — et rien d'autre.

## Ce que tu livres

1. **Un contrat de données de section parcours**, côté vitrine, qui décrit ce que la section
   sait afficher : l'épreuve (depuis `EpreuveView`) plus les champs que l'épopée 11 remplira
   (dénivelés, altitudes, points de passage). Ces champs supplémentaires sont **optionnels**
   et valent `null` aujourd'hui. Un seul point d'entrée, documenté, que la story 11.1
   branchera sur `parcours.json` sans toucher au rendu.
2. **Le sélecteur d'épreuve** : il pilote ensemble le libellé, la synthèse chiffrée, la liste
   des points de passage et l'emplacement de la visualisation. Une seule variable d'état.
   Il doit fonctionner **sans JavaScript** si tu en es capable proprement (la vitrine vise un
   téléphone d'entrée de gamme en 3G) ; si tu choisis du JavaScript client, justifie-le et
   mesure ce que ça ajoute au budget.
3. **La synthèse et les points de passage** : rendus pour les champs réellement disponibles,
   chiffres en monospace alignés, services en toutes lettres quand ils existeront.
4. **L'emplacement de la visualisation** : un bloc qui annonce explicitement ce qui viendra,
   sans cadre vide ni message d'erreur, et qui reste utile tel quel. La section doit se tenir
   debout seule — c'est son critère d'acceptation principal.
5. Le lien vers `/parcours` reste présent : cette section ne remplace pas la page détaillée.

## Contraintes

- La section **ne prend jamais le premier écran** de l'accueil : elle vient après le hero.
- Budget inchangé : pas de police, pas d'image, pas de dépendance. Formes en SVG inline.
- Accessibilité : le sélecteur est un vrai contrôle au clavier, l'épreuve active est annoncée
  autrement que par la couleur, cibles ≥ 44 px, focus 2 px.
- Sur la portion commune aux deux épreuves, un même point de passage n'aura pas le même
  kilomètre : l'épreuve active doit donc rester lisible au contact du kilométrage. Prévois-le
  dans la structure même si aucun kilomètre n'est affiché aujourd'hui.
- Tu consommes les classes du socle `apps/web/src/app/socle.css`.

## Tests attendus

Tu ajoutes des tests qui vérifient au minimum : le sélecteur bascule bien l'ensemble de la
section ; aucun chiffre de dénivelé, d'altitude, d'horaire ou de barrière n'apparaît tant que
la donnée est nulle ; la section rend sans la visualisation ; le lien `/parcours` est présent.

## Boucle de vérification

```
pnpm typecheck
pnpm test
git diff --stat
```

Zéro échec. Dis-moi le delta de tests et à quoi il correspond.

## Ce que tu rends

1. Le contrat de données retenu, et où il vit
2. Comment le sélecteur fonctionne, et s'il exige du JavaScript — avec le coût mesuré
3. Ce que la section affiche aujourd'hui, champ par champ, et ce qui reste vide
4. Comment l'épopée 11 s'y branchera, concrètement
5. La sortie des trois commandes
6. Ce dont tu n'es pas sûr

---

## Note ajoutée après la livraison de 9.2

La story 9.2 est committée. Deux faits qui te concernent directement :

- **Le budget est à 299,7 Kio pour un plafond de 300 Kio.** Il te reste 0,3 Kio. Si ta
  section ne tient pas dedans, **dis-le-moi au lieu de rogner ailleurs** : je préfère
  arbitrer que découvrir une page dégradée. Mesure avant de me rendre la main.
- `socle.css` est importé depuis `layout.tsx`, il est donc déjà chargé : tu consommes ses
  classes sans import supplémentaire.
- Le rail du hero affiche Date, Épreuves, Départ, Cadre — et rien d'autre, faute de source
  officielle pour les dénivelés. Applique la même règle dans ta section.
