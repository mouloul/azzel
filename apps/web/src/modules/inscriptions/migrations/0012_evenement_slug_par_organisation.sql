-- Correctif socle multi-organisation (story 1.9) : en 0002, evenement.slug était
-- déclaré UNIQUE *globalement*, alors que toutes les autres tables sont scopées par
-- organisation (UNIQUE (organisation_id, email), UNIQUE (evenement_id, slug)…).
-- Deux organisations n'auraient pas pu nommer leur événement du même slug : la
-- seconde cliente aurait été bloquée. L'unicité devient (organisation_id, slug).
--
-- Exécution en connexion PROPRIÉTAIRE (DATABASE_OWNER_URL, voir migrate.ts) comme
-- toutes les migrations : le RLS activé en 0009 ne s'oppose pas à ce DDL, qui ne lit
-- ni n'écrit aucune ligne (le GUC app.organisation_id n'est pas requis).
--
-- Note : les seeds de 0002 utilisent ON CONFLICT (slug) — ils s'exécutent avant cette
-- migration sur une base neuve, et une seule fois (schema_migrations). Rien à reprendre.

DO $$
DECLARE
  nom_contrainte text;
  attnum_slug smallint;
BEGIN
  SELECT a.attnum INTO attnum_slug
  FROM pg_attribute a
  WHERE a.attrelid = 'evenement'::regclass AND a.attname = 'slug';

  -- Contrainte d'unicité portant sur la seule colonne slug (nom par défaut
  -- evenement_slug_key, mais on ne s'y fie pas).
  SELECT con.conname INTO nom_contrainte
  FROM pg_constraint con
  WHERE con.conrelid = 'evenement'::regclass
    AND con.contype = 'u'
    AND array_length(con.conkey, 1) = 1
    AND con.conkey[1] = attnum_slug;

  IF nom_contrainte IS NOT NULL THEN
    EXECUTE format('ALTER TABLE evenement DROP CONSTRAINT %I', nom_contrainte);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'evenement'::regclass
      AND conname = 'evenement_organisation_slug_key'
  ) THEN
    ALTER TABLE evenement
      ADD CONSTRAINT evenement_organisation_slug_key UNIQUE (organisation_id, slug);
  END IF;
END
$$;
