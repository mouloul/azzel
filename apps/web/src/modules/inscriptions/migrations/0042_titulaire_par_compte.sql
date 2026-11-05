-- Un titulaire PAR compte : le CCP et le compte Baridimob n'appartiennent pas
-- forcément à la même personne. Le titulaire unique de 0041 devient celui du CCP.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'edition' AND column_name = 'titulaire_compte'
  ) THEN
    ALTER TABLE edition RENAME COLUMN titulaire_compte TO titulaire_ccp;
  END IF;
END $$;

ALTER TABLE edition
  ADD COLUMN IF NOT EXISTS titulaire_ccp text,
  ADD COLUMN IF NOT EXISTS titulaire_baridimob text;
