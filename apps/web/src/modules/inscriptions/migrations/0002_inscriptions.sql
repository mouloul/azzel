CREATE TABLE IF NOT EXISTS evenement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS edition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  evenement_id uuid NOT NULL REFERENCES evenement (id),
  slug text NOT NULL,
  name text NOT NULL,
  race_date date NOT NULL,
  registration_closes_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evenement_id, slug)
);

CREATE TABLE IF NOT EXISTS epreuve (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  edition_id uuid NOT NULL REFERENCES edition (id),
  slug text NOT NULL,
  name text NOT NULL,
  distance_km numeric(4, 1) NOT NULL CHECK (distance_km > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition_id, slug)
);

CREATE INDEX IF NOT EXISTS epreuve_edition_idx ON epreuve (edition_id);

CREATE TABLE IF NOT EXISTS coureur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  account_id uuid NOT NULL REFERENCES account (id),
  edition_id uuid NOT NULL REFERENCES edition (id),
  epreuve_id uuid NOT NULL REFERENCES epreuve (id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  emergency_contact_name text NOT NULL,
  emergency_contact_phone text NOT NULL,
  birth_date date NOT NULL,
  tshirt_size text NOT NULL CHECK (tshirt_size IN ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  age integer NOT NULL CHECK (age BETWEEN 10 AND 100),
  age_category text NOT NULL CHECK (age_category IN ('U20', 'Senior', 'V1', 'V2', 'V3')),
  status text NOT NULL DEFAULT 'en constitution',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, edition_id)
);

CREATE INDEX IF NOT EXISTS coureur_edition_idx ON coureur (edition_id);

INSERT INTO evenement (organisation_id, slug, name)
SELECT o.id, 'trail-ait-aissi', 'Trail d''Aït-Aïssi'
FROM organisation o
WHERE o.slug = 'ait-aissi'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO edition (organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
SELECT ev.organisation_id, ev.id, '2027', 'Édition 2027', DATE '2027-03-26', TIMESTAMPTZ '2027-03-16T22:59:59Z'
FROM evenement ev
WHERE ev.slug = 'trail-ait-aissi'
ON CONFLICT (evenement_id, slug) DO NOTHING;

INSERT INTO epreuve (organisation_id, edition_id, slug, name, distance_km)
SELECT ed.organisation_id, ed.id, 'longue', 'La Longue — 35 km', 35.0
FROM edition ed
WHERE ed.slug = '2027'
ON CONFLICT (edition_id, slug) DO NOTHING;

INSERT INTO epreuve (organisation_id, edition_id, slug, name, distance_km)
SELECT ed.organisation_id, ed.id, 'moyenne', 'La Moyenne — 12 km', 12.0
FROM edition ed
WHERE ed.slug = '2027'
ON CONFLICT (edition_id, slug) DO NOTHING;
