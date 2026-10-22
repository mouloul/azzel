-- Story 2.5 — retour en images de la 1ʳᵉ édition (trailer + témoignages).
-- temoignage : citation courte d'un coureur (rendu public sobre, ordre défini
-- par l'organisateur — jamais de carrousel automatique) ; vitrine_media_config :
-- URL https facultative du trailer (le comité héberge la vidéo où il veut :
-- YouTube, streaming propre — aucun upload, aucun stockage média ici).
-- RLS : même politique d'isolation que 0009/0010/0014, posée ici car ces tables
-- naissent après elles (le runner applique 0015 en propriétaire, comme le reste).

CREATE TABLE temoignage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  citation text NOT NULL CHECK (char_length(citation) BETWEEN 1 AND 280),
  prenom text NOT NULL CHECK (char_length(prenom) BETWEEN 1 AND 40),
  edition_reference text NOT NULL CHECK (char_length(edition_reference) BETWEEN 1 AND 40),
  -- Ordre d'affichage borné (validation applicative + CHECK ici) : un entier
  -- positif sur 4 chiffres maximum.
  ordre int NOT NULL DEFAULT 1 CHECK (ordre BETWEEN 1 AND 9999),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ordre d'affichage public : ordre défini par l'admin, puis insertion.
CREATE INDEX temoignage_organisation_ordre_idx
  ON temoignage (organisation_id, ordre, created_at, id);

CREATE TABLE vitrine_media_config (
  organisation_id uuid PRIMARY KEY REFERENCES organisation (id),
  -- https exclusivement (défense en profondeur contre le XSS stocké, cf. 0014
  -- gpx_url) : le bloc trailer est absent tant que l'URL est NULL.
  trailer_url text CHECK (
    trailer_url IS NULL OR (char_length(trailer_url) <= 2048 AND trailer_url ~ '^https://')
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE temoignage ENABLE ROW LEVEL SECURITY;
ALTER TABLE temoignage FORCE ROW LEVEL SECURITY;
CREATE POLICY temoignage_org_isolation ON temoignage FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE vitrine_media_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitrine_media_config FORCE ROW LEVEL SECURITY;
CREATE POLICY vitrine_media_config_org_isolation ON vitrine_media_config FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

-- Grants applicatifs explicites (défense en profondeur, voir 0010).
GRANT SELECT, INSERT, UPDATE, DELETE ON temoignage, vitrine_media_config TO azzel_app;
