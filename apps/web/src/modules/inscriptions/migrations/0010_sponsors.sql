-- Story 2.3 — sponsors vitrine (option A signature / option B multi-emplacements).
-- sponsor : un partenaire de l'organisation (nom affiché, liens facultatifs) ;
-- vitrine_sponsors_config : mode d'affichage de la section partenaires ('A'|'B'),
-- édité depuis l'espace admin — jamais par env ni code (FR-22).
-- RLS : même politique d'isolation que 0009, posée ici car ces tables naissent
-- après elle (le runner applique 0010 en propriétaire, comme le reste).

CREATE TABLE sponsor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  url text,
  logo_url text,
  is_signature boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ordre d'affichage option B = ordre de création.
CREATE INDEX sponsor_organisation_created_idx ON sponsor (organisation_id, created_at, id);

-- Un seul sponsor signature par organisation : le store retire le flag avant
-- d'en poser un autre ; cet index unique partiel refuse les courses concurrentes.
CREATE UNIQUE INDEX sponsor_signature_unique ON sponsor (organisation_id) WHERE is_signature;

CREATE TABLE vitrine_sponsors_config (
  organisation_id uuid PRIMARY KEY REFERENCES organisation (id),
  mode text NOT NULL CHECK (mode IN ('A', 'B')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sponsor ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor FORCE ROW LEVEL SECURITY;
CREATE POLICY sponsor_org_isolation ON sponsor FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE vitrine_sponsors_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitrine_sponsors_config FORCE ROW LEVEL SECURITY;
CREATE POLICY vitrine_sponsors_config_org_isolation ON vitrine_sponsors_config FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

-- Grants applicatifs explicites (défense en profondeur : les ALTER DEFAULT
-- PRIVILEGES de 0008 ne couvrent pas une base migrée avant leur pose — les
-- privileges par défaut ne s'appliquent qu'aux tables créées APRÈS).
GRANT SELECT, INSERT, UPDATE, DELETE ON sponsor, vitrine_sponsors_config TO azzel_app;
