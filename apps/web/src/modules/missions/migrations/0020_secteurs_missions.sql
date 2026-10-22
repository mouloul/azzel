-- Story 3.2 — secteurs et missions typées : découpage de l'édition courante.
--
-- Frontière de données (épopée 3) : ÉDITION → SECTEUR → MISSION → AFFECTATION.
-- organisation_id descend dans chaque table, RLS stricte pattern 0018 (ces
-- tables sont TOUJOURS accédées sous GUC d'organisation : aucune exception
-- pré-GUC, contrairement à invitation pattern 0011).
--
-- secteur : lieu géographique rattaché à l'édition (nom UNIQUE par édition).
-- mission : 6 types FERMÉS (CHECK), horaires timestamptz CHECK fin > debut ;
--   consignes posées dès 3.2 pour que la fiche hors-ligne 3.3 n'ajoute aucune
--   migration.
-- affectation : N-N mission↔volontaire ; la couverture est DÉRIVÉE des
--   affectations (≥ 1 = couverte), jamais stockée. La suppression d'une mission
--   cascade ses affectations ; la suppression d'un secteur est refusée par le
--   store tant qu'il porte des missions (409 applicatif, pas de cascade muette).

CREATE TABLE secteur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  edition_id uuid NOT NULL REFERENCES edition (id),
  nom text NOT NULL CHECK (char_length(nom) BETWEEN 1 AND 120),
  lieu text NOT NULL CHECK (char_length(lieu) BETWEEN 1 AND 200),
  contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition_id, nom)
);

CREATE INDEX secteur_edition_idx ON secteur (edition_id);

CREATE TABLE mission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  secteur_id uuid NOT NULL REFERENCES secteur (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'scan_checkpoint', 'accueil', 'securite_troncon', 'securite_arrivee',
    'distribution_dossards', 'communication'
  )),
  titre text NOT NULL CHECK (char_length(titre) BETWEEN 1 AND 120),
  debut_le timestamptz NOT NULL,
  fin_le timestamptz NOT NULL,
  consignes text CHECK (char_length(consignes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fin_le > debut_le)
);

CREATE INDEX mission_secteur_idx ON mission (secteur_id);
CREATE INDEX mission_horaires_idx ON mission (debut_le, fin_le);

CREATE TABLE affectation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  mission_id uuid NOT NULL REFERENCES mission (id) ON DELETE CASCADE,
  volontaire_id uuid NOT NULL REFERENCES volontaire (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, volontaire_id)
);

CREATE INDEX affectation_volontaire_idx ON affectation (volontaire_id);

ALTER TABLE secteur ENABLE ROW LEVEL SECURITY;
ALTER TABLE secteur FORCE ROW LEVEL SECURITY;
CREATE POLICY secteur_org_isolation ON secteur FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE mission ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission FORCE ROW LEVEL SECURITY;
CREATE POLICY mission_org_isolation ON mission FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE affectation ENABLE ROW LEVEL SECURITY;
ALTER TABLE affectation FORCE ROW LEVEL SECURITY;
CREATE POLICY affectation_org_isolation ON affectation FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON secteur TO azzel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mission TO azzel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON affectation TO azzel_app;
