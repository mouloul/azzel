# Polices d'origine

Fichiers tels que reçus, **avant élagage**. Ils ne sont pas servis : ils servent
de source à `scripts/sous-ensemble-polices.sh`, qui régénère les fichiers de
`apps/web/public/charte/fonts/`.

Ne jamais écraser un fichier de ce dossier par une version élaguée : l'élagage
deviendrait irréversible et toute évolution de la liste des fonctionnalités
OpenType conservées serait perdue.

| Famille | Graisses | Licence |
| --- | --- | --- |
| Inter | 400, 500, 600, 700 | SIL Open Font License 1.1 (`OFL-Inter.txt`) |
| Barlow Condensed | 500, 600, 700, 800 | SIL Open Font License 1.1 (`OFL-Barlow-Condensed.txt`) |

Sous-ensemble de caractères : `latin` (230 codepoints pour Inter, 227 pour
Barlow Condensed), tel que distribué par Fontsource. L'élagage conserve cette
table intégralement — il ne retire que des glyphes qu'aucun caractère ne peut
atteindre.

## Régénérer les fichiers servis

```bash
pnpm polices:elaguer              # régénère et remplace
bash scripts/sous-ensemble-polices.sh --verifier   # compare sans écrire
```

Le script échoue si un caractère disparaît. Vérifier ensuite le budget :

```bash
pnpm budget
```
