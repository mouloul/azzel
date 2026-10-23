-- Story 6.2 (FR-18, AD-2, AD-5, SM-C2) — module tracking : ingestion append-only
-- des positions GPS de l'app coureurs + jeton d'appareil dédié au canal sync.
--
-- appareil_coureur : un enregistrement par installation de l'app coureurs
-- (find-or-create par (org, account, appareil_client) UNIQUE). Le jeton BRUT
-- n'est retourné qu'une fois à l'enregistrement, seul le hash sha256 vit en
-- base (gabarit exact 0025). Révocable (revoked_at) SANS toucher aux sessions :
-- la outbox survit aux sessions (AD-5 — un login web ailleurs ne coupe JAMAIS
-- la sync positions), pas à une révocation d'appareil. RLS pattern 0011 :
-- cherchée par SECRET (hash du jeton) AVANT que l'organisation soit connue —
-- hors GUC la ligne est lisible (le secret reste le contrôle d'accès), sous
-- GUC le cloisonnement org est total.
--
-- position : table d'ingestion append-only SERVEUR. La clé d'idempotence du
-- contrat shared (appareil:capteA) y est UNIQUE : le rejeu d'un lot entier
-- est un no-op visible (« déjà-connu » via ON CONFLICT DO NOTHING), JAMAIS un
-- doublon. capte_at = heure APPAREIL (donnée brute), recu_a = réception
-- SERVEUR, offset_estime_ms = audit de dérive d'horloge. lat/lon numeric avec
-- CHECK des bornes GPS en défense en profondeur (la garde shared a déjà
-- refusé localement). Aucune suppression/édition : la carte publique (épopée
-- 7) lira par-dessus, jamais dedans. RLS stricte pattern 0020 (TOUJOURS sous
-- GUC — une position n'est lisible que de son organisation).

CREATE TABLE appareil_coureur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  account_id uuid NOT NULL REFERENCES account (id),
  appareil_client text NOT NULL CHECK (char_length(appareil_client) BETWEEN 1 AND 120),
  jeton_hash text NOT NULL UNIQUE,
  revoked_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, account_id, appareil_client)
);

CREATE TABLE position (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  appareil_coureur_id uuid NOT NULL REFERENCES appareil_coureur (id),
  cle_idempotence text NOT NULL UNIQUE,
  latitude numeric(9, 6) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude numeric(9, 6) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  capte_at timestamptz NOT NULL,
  recu_a timestamptz NOT NULL DEFAULT now(),
  offset_estime_ms bigint NOT NULL
);

-- Lecture naturelle de la carte publique (story 7.3) : dernières positions par
-- appareil, org-scopées — jamais touchée par l'ingestion.
CREATE INDEX position_appareil_recu_idx ON position (appareil_coureur_id, recu_a);
CREATE INDEX position_organisation_idx ON position (organisation_id);

ALTER TABLE appareil_coureur ENABLE ROW LEVEL SECURITY;
ALTER TABLE appareil_coureur FORCE ROW LEVEL SECURITY;
CREATE POLICY appareil_coureur_org_scoped ON appareil_coureur FOR ALL
  USING (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  )
  WITH CHECK (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  );

ALTER TABLE position ENABLE ROW LEVEL SECURITY;
ALTER TABLE position FORCE ROW LEVEL SECURITY;
CREATE POLICY position_org_isolation ON position FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON appareil_coureur TO azzel_app;
GRANT SELECT, INSERT ON position TO azzel_app;
