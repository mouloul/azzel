# Story 11.4 — révision de l'architecte (retour de revue)

Projet `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/story-11-4-profil-altimetrique`.
Tu es le développeur, je suis l'architecte/PO. J'ai relu ton code (profil-altimetrique.tsx,
profil-curseur.tsx) : le travail est bon, vérifié (typecheck, 198 fichiers / 2651 tests, budget
288 Kio). Mais j'ai trouvé trois défauts de substance et une décision produit à appliquer.
Interdits inchangés : aucune commande git en écriture, pas de modification de
`_bmad-output/planning-artifacts/` ni de `sprint-status.yaml` ni de `deferred-work.md`, aucune
dépendance, aucun test existant affaibli. Postgres de dev doit rester allumé (ne l'arrête pas).
**Pas de point de contrôle bmad** : modifications directes, puis rapport.

## Défauts à corriger (je les ai lus dans le code, vérifie-les puis corrige)

1. **Le survol souris ne lit rien.** L'AC de la 11.4 dit « la lecture est possible au survol
   **comme** au tap ». Dans `profil-curseur.tsx`, `surPointeurDeplace` ne met à jour `sM` que si
   `saisieRef.current` (bouton enfoncé / tap). À la souris sans clic, rien ne se passe. Corrige :
   pour `pointerType === 'mouse'`, le déplacement sans bouton met à jour la lecture ; pour
   tactile/stylet, le comportement actuel (appui puis glisse) reste. Extrais la décision dans une
   **fonction pure** de `profil.ts` (ex. `lecturePendantDeplacement(pointerType, saisie)`) testée
   dans `profil.test.ts` (souris sans appui → lit ; tactile sans appui → ne lit pas ; tactile
   appuyé → lit). Aucun test DOM n'est possible : la fonction pure est la garantie.
2. **Double annonce lecteur d'écran.** Le slider porte `aria-valuetext` ET le `<p aria-live>`
   répète le même texte : un lecteur d'écran annonce deux fois à chaque flèche. Garde
   `aria-valuetext` (mécanisme natif du slider) et le texte **visible**, retire `aria-live` du
   paragraphe. Ajuste les tests qui épinglaient `aria-live="polite"` (liste-les, justifie) et
   épingle que la lecture visible reste présente et que `aria-valuetext` est égal au texte visible.
3. **Événement parasite au montage.** Le `useEffect` émet `az-parcours-curseur` avec `sM = 0` dès
   le montage, avant toute interaction : la 11.5 déplacerait le repère de la carte au départ sans
   que personne n'ait touché au profil. N'émets l'événement que sur une **interaction** (pointeur,
   clavier), jamais au montage. Mets à jour le commentaire de contrat.

## Décision produit à appliquer (2026-11-04)

Le relevé GPX est un **relevé d'essai** (« essai trail ait ainsi 2027 », 28,0 km) ; le tracé
définitif n'existe pas et pourra évoluer. Les chiffres affichés doivent être **cohérents entre
eux** et alignés sur ce relevé :
4. Dans la fusion de `section-parcours.ts` : pour une épreuve présente dans `parcours.json`, la
   **distance affichée** vient du JSON (`distanceM / 1000`, ici 28,0 km) et non de la base
   (`epreuve.distanceKm`). Une épreuve absente du JSON garde la distance de la base (la moyenne).
   Un test épingle les deux cas.
5. **Mention « tracé provisoire »** visible dans le panneau d'une épreuve qui a des données
   issues du relevé : texte sobre et factuel, p. ex. « Tracé provisoire, issu d'un relevé d'essai :
   distance, dénivelé et profil pourront évoluer. » — jamais présenté comme officiel. Elle
   n'apparaît pas pour une épreuve sans données (la moyenne). Ajoute-la au **markup serveur**
   (visible sans JS), avec un test de rendu. Le texte vit dans une constante nommée (une seule
   source) pour qu'on puisse la retirer en une ligne le jour du tracé officiel.
6. La page `/parcours` (et sa donnée) annonce ~35 km pour la longue : **ne la modifie pas** (c'est
   une donnée éditoriale de la base, hors périmètre) mais **cite dans ton rapport** exactement
   où ce chiffre apparaît (fichier:ligne ou clé de seed) pour que je le consigne.

## Exigences de qualité

- `pnpm typecheck` (3 paquets), `pnpm test`, `pnpm budget` ≤ 300 Kio verts ; donne les nombres et
  le budget avant/après.
- Aucun hex en dur ; pas de chinois ; pas de commit ; mets la spec 11.4 à jour (Review Triage
  Log : ce retour de revue, ce que tu as corrigé ; Verification).
- Rapport final honnête : pour chaque point 1 à 6, *corrigé + test (nom)* / *non vérifiable ici*.
