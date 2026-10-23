-- Story 4.5 (AD-2, AD-3, AD-5, NFR-3) — module chrono : ingestion append-only
-- des événements terrain + jeton d'appareil dédié au canal sync.
--
-- terrain_evenement : table d'ingestion append-only SERVEUR. La clé
-- d'idempotence du contrat shared (appareil + type/version + édition + jeton
-- [+ checkpoint]) y est UNIQUE : le rejeu d'un lot entier est un no-op visible
-- (« déjà-connu » via ON CONFLICT DO NOTHING), JAMAIS un doublon. L'arbitrage
-- premier-reçu-fait-foi (AD-3) s'appuie sur horodatage_reception SERVEUR
-- (monotone, hors horloges clients) indexé avec la clé naturelle
-- (édition, jeton, checkpoint) ; l'heure APPAREIL et l'offset estimé restent
-- des DONNÉES d'audit. Aucune suppression/édition : les annulations auditable
-- viendront en épopée 5 par-dessus cette table, jamais dedans.
-- appareil_id porte l'identifiant CLIENT brut (celui de la clé d'idempotence,
-- généré hors-ligne) : text, pas de FK — l'audit survit à toute donnée amont.
--
-- appareil : un enregistrement par appareil scanneur (find-or-create par
-- appareil_client UNIQUE par org). jeton_hash UNIQUE : le jeton BRUT n'est
-- retourné qu'une fois à l'enregistrement/rotation, seul le hash sha256 vit
-- en base (pattern invitation). Révocable (revoked_at) SANS toucher aux
-- sessions : la boîte d'envoi survit aux sessions (AD-5), pas aux révocations
-- d'appareil. RLS pattern 0011 : cherchée par SECRET (hash du jeton) AVANT
-- que l'organisation soit connue — hors GUC la ligne est lisible (le secret
-- reste le contrôle d'accès), sous GUC le cloisonnement org est total.
--
-- terrain_evenement : RLS stricte pattern 0020 (TOUJOURS sous GUC).

CREATE TABLE appareil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  appareil_client text NOT NULL CHECK (char_length(appareil_client) BETWEEN 1 AND 120),
  jeton_hash text NOT NULL UNIQUE,
  revoked_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, appareil_client)
);

CREATE TABLE terrain_evenement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  cle_idempotence text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('retrait', 'passage')),
  edition_id uuid NOT NULL REFERENCES edition (id),
  jeton_coureur text NOT NULL,
  checkpoint_id uuid,
  horodatage_appareil timestamptz NOT NULL,
  horodatage_reception timestamptz NOT NULL DEFAULT now(),
  offset_estime_ms bigint NOT NULL,
  appareil_id text NOT NULL CHECK (char_length(appareil_id) BETWEEN 1 AND 120),
  CHECK ((type = 'passage') = (checkpoint_id IS NOT NULL))
);

-- Clé naturelle + ordre d'arbitrage : premier horodatage_reception reçu pour
-- (édition, jeton, checkpoint) fait foi (AD-3) — le consommateur premierRecu
-- (épopées 5/7) lit cet index, jamais l'ingestion.
CREATE INDEX terrain_evenement_cle_naturelle_idx
  ON terrain_evenement (edition_id, jeton_coureur, checkpoint_id, horodatage_reception);

CREATE INDEX terrain_evenement_organisation_idx ON terrain_evenement (organisation_id);

ALTER TABLE appareil ENABLE ROW LEVEL SECURITY;
ALTER TABLE appareil FORCE ROW LEVEL SECURITY;
CREATE POLICY appareil_org_scoped ON appareil FOR ALL
  USING (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  )
  WITH CHECK (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  );

ALTER TABLE terrain_evenement ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain_evenement FORCE ROW LEVEL SECURITY;
CREATE POLICY terrain_evenement_org_isolation ON terrain_evenement FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON appareil TO azzel_app;
GRANT SELECT, INSERT ON terrain_evenement TO azzel_app;
