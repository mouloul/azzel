CREATE TABLE IF NOT EXISTS preuve (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  coureur_id uuid NOT NULL REFERENCES coureur (id),
  storage_key text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 307200),
  sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'replaced')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS preuve_coureur_idx ON preuve (coureur_id);

CREATE UNIQUE INDEX IF NOT EXISTS preuve_coureur_active_uidx ON preuve (coureur_id) WHERE status = 'active';
