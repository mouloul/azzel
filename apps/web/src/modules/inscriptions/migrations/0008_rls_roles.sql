-- Story 1.9 (AD-4, FR-27) — rôle applicatif Postgres `azzel_app`.
-- L'application s'y connecte (DATABASE_URL) : SELECT/INSERT/UPDATE/DELETE sur les
-- tables métier uniquement, jamais de DDL. Les migrations tournent en propriétaire
-- (DATABASE_OWNER_URL). Ce bloc DO idempotent couvre les environnements existants ;
-- `scripts/dev-db.sh` crée aussi le rôle sur les bases neuves (avant toute migration).
-- Le mot de passe vient de l'env AZZEL_APP_PASSWORD (défaut « azzel »), injecté par
-- le runner de migrations via le placeholder entre quotes ci-dessous.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'azzel_app') THEN
    CREATE ROLE azzel_app LOGIN PASSWORD '__AZZEL_APP_PASSWORD__';
  ELSE
    -- Rotation de mot de passe : le rôle existe déjà (dev-db.sh ou run précédent),
    -- on réaligne LOGIN/mot de passe sur AZZEL_APP_PASSWORD.
    ALTER ROLE azzel_app LOGIN PASSWORD '__AZZEL_APP_PASSWORD__';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO azzel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organisation, account, evenement, edition, epreuve, coureur,
  document, preuve, email_outbox
  TO azzel_app;
-- DELETE jamais utilisé par l'application sur login_code/session.
GRANT SELECT, INSERT, UPDATE ON login_code, session TO azzel_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO azzel_app;

-- Migrations futures : les nouvelles tables/séquences créées par ce rôle
-- propriétaire héritent des grants applicatifs.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO azzel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO azzel_app;

-- FORCE RLS (0009) s'applique aussi au propriétaire des tables : un propriétaire
-- non-superuser serait filtré par ses propres politiques lors des migrations
-- suivantes (seeds…). On donne donc BYPASSRLS au rôle propriétaire courant ;
-- exception avalée si le rôle exécutant n'a pas le droit (non superuser) — les
-- migrations doivent alors tourner avec un rôle suffisamment privilégié.
DO $$
DECLARE
  table_owner name;
BEGIN
  SELECT tableowner INTO table_owner
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'coureur';
  IF table_owner IS NOT NULL THEN
    EXECUTE format('ALTER ROLE %I BYPASSRLS', table_owner);
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'BYPASSRLS non accordé à « % » : le rôle exécutant manque de privilèges.', table_owner;
END
$$;

-- schema_migrations reste hors de portée du rôle applicatif : suivi des migrations
-- en propriétaire uniquement.
