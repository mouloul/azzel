-- Correctif sécurité stories 1.2 / 1.9 — isolation multi-organisation de
-- login_code et session, et quota anti-abus par adresse IP.
--
-- 0009 avait laissé ces deux tables en RLS « permissif » (USING (true), sans
-- FORCE ROW LEVEL SECURITY) au motif, documenté en Design Notes de la spec 1.9,
-- qu'elles sont cherchées par secret AVANT que l'organisation soit connue.
-- Ce motif tient pour la recherche initiale, il ne justifie pas que les écritures
-- et les relectures faites APRÈS, à l'intérieur d'un withOrg, traversent les
-- organisations : dès la 2e organisation, l'UPDATE d'invalidation d'un code
-- (WHERE email = …) annulait le code de l'autre organisation pour la même adresse.
--
-- Nouveau contrat, aligné sur le style de 0009 :
--   GUC `app.organisation_id` posé  → seules les lignes de cette organisation ;
--   GUC absent (ou '' après SET LOCAL expiré) → toutes les lignes.
-- La recherche par secret (token de session, pré-sélection du code) continue donc
-- de fonctionner hors GUC — le secret reste le contrôle d'accès —, mais tout ce
-- qui se passe sous withOrg est désormais réellement cloisonné, FORCE RLS compris
-- (le propriétaire des tables garde BYPASSRLS, cf. 0008, pour les migrations).

ALTER TABLE login_code FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS login_code_permissive_select ON login_code;
DROP POLICY IF EXISTS login_code_permissive_insert ON login_code;
DROP POLICY IF EXISTS login_code_permissive_update ON login_code;
CREATE POLICY login_code_org_scoped ON login_code FOR ALL
  USING (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  )
  WITH CHECK (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  );

ALTER TABLE session FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_permissive_select ON session;
DROP POLICY IF EXISTS session_permissive_insert ON session;
DROP POLICY IF EXISTS session_permissive_update ON session;
CREATE POLICY session_org_scoped ON session FOR ALL
  USING (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  )
  WITH CHECK (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  );

-- Quota par adresse IP de la demande de code (story 1.2).
-- Table d'infrastructure anti-abus : AUCUNE donnée métier, aucune organisation —
-- le quota s'applique avant que l'organisation soit résolue et vaut pour toutes.
-- Elle ne stocke que l'empreinte salée de l'IP (AZZEL_IP_HASH_SALT), jamais l'IP.
-- RLS activé malgré tout (aucune table du schéma ne doit rester hors RLS), avec
-- une politique volontairement permissive : il n'y a rien à cloisonner ici.
CREATE TABLE IF NOT EXISTS login_code_ip_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_code_ip_request_ip_created_idx
  ON login_code_ip_request (ip_hash, created_at DESC);

ALTER TABLE login_code_ip_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_code_ip_request FORCE ROW LEVEL SECURITY;
CREATE POLICY login_code_ip_request_no_tenant ON login_code_ip_request FOR ALL
  USING (true) WITH CHECK (true);

-- DELETE nécessaire : la purge des lignes hors fenêtre est faite par l'application
-- à chaque demande (pas de tâche planifiée en V1).
GRANT SELECT, INSERT, DELETE ON login_code_ip_request TO azzel_app;
