-- Affichage public de la date exacte de la course.
--
-- La date reste en base, exacte, parce que tout en dépend : l'âge à la course,
-- l'ordre des éditions, le chronométrage. Ce réglage ne pilote que ce que le
-- PUBLIC lit — tant qu'il vaut 0, la vitrine et le parcours coureur ne
-- montrent que la saison (« printemps 2027 »), calculée depuis la vraie date.
--
-- Entier 0/1 et non booléen : le journal des réglages stocke des entiers, et
-- c'est le même chemin d'écriture que la capacité ou les prix. Une colonne
-- booléenne exigerait un cas particulier, pour un gain nul.
--
-- Défaut 0 = date cachée : une édition créée sans que personne y pense ne
-- divulgue rien.

ALTER TABLE edition
  ADD COLUMN IF NOT EXISTS date_course_publique integer NOT NULL DEFAULT 0;

ALTER TABLE edition
  DROP CONSTRAINT IF EXISTS edition_date_course_publique_check;

ALTER TABLE edition
  ADD CONSTRAINT edition_date_course_publique_check
  CHECK (date_course_publique IN (0, 1));
