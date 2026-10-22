-- Story 3.4 — dossards des coureurs. Colonne nullable (l'épopée 1 valide les
-- dossiers sans numéroter) : l'attribution se fait par lot idempotent côté
-- admin, JAMAIS de renumérotation — le numéro n'est ni réutilisé ni repris.
-- Défense en profondeur en SQL : CHECK 1–9999 + UNIQUE partielle par édition
-- (les NULL restent hors index, plusieurs coureurs non numérotés cohabitent).

ALTER TABLE coureur ADD COLUMN dossard integer;

ALTER TABLE coureur ADD CONSTRAINT coureur_dossard_range_chk
  CHECK (dossard IS NULL OR dossard BETWEEN 1 AND 9999);

CREATE UNIQUE INDEX coureur_edition_dossard_key
  ON coureur (edition_id, dossard)
  WHERE dossard IS NOT NULL;
