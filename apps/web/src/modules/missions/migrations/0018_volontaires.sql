-- Story 3.1 — module missions : fiches volontaires issues de l'import.
-- volontaire : la fiche métier (nom, téléphone) liée au compte (rôle
-- 'volontaire') ; UNIQUE (account_id) — un compte volontaire a une fiche.
-- RLS : politique stricte d'isolation par organisation, même style que 0009
-- (cette table n'est JAMAIS cherchée par secret : pas d'exception pré-GUC).

CREATE TABLE volontaire (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  account_id uuid NOT NULL UNIQUE REFERENCES account (id) ON DELETE CASCADE,
  nom text NOT NULL CHECK (char_length(nom) BETWEEN 1 AND 120),
  telephone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX volontaire_organisation_created_idx ON volontaire (organisation_id, created_at, id);

ALTER TABLE volontaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE volontaire FORCE ROW LEVEL SECURITY;
CREATE POLICY volontaire_org_isolation ON volontaire FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON volontaire TO azzel_app;
