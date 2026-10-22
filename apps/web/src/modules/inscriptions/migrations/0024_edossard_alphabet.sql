-- Story 4.1 (revue) — le CHECK 0023 ne bornait que la longueur : le jeton
-- doit en plus respecter l'alphabet base64url, symétrie EXACTE avec
-- estJetonEdossardValide (packages/shared/src/edossard.ts). Défense en
-- profondeur SQL : la base ne peut pas contenir un jeton que le contrat
-- shared refuserait.

ALTER TABLE coureur ADD CONSTRAINT coureur_jeton_edossard_alphabet_chk
  CHECK (jeton_edossard IS NULL OR jeton_edossard ~ '^[A-Za-z0-9_-]{22}$');
