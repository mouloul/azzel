-- Story 4.1 — jeton e-dossard. Colonne nullable : le jeton naît à la PREMIÈRE
-- consultation du coureur validé (création paresseuse, jamais régénérée) — le
-- flux de validation 1.6 reste intouché. Défense en profondeur en SQL :
-- CHECK longueur 22 (base64url de randomBytes(16)) + UNIQUE partielle — les
-- NULL restent hors index, les validés non consultés cohabitent ; un jeton
-- n'appartient jamais à deux coureurs (même hors édition : le QR encode le
-- jeton seul, il doit désigner UN coureur, point final).

ALTER TABLE coureur ADD COLUMN jeton_edossard text;

ALTER TABLE coureur ADD CONSTRAINT coureur_jeton_edossard_longueur_chk
  CHECK (jeton_edossard IS NULL OR length(jeton_edossard) = 22);

CREATE UNIQUE INDEX coureur_jeton_edossard_key
  ON coureur (jeton_edossard)
  WHERE jeton_edossard IS NOT NULL;
