-- Story 1.9 (DERNIÈRE migration) — activation du Row Level Security.
-- Elle doit rester la dernière : FORCE RLS s'applique aussi au propriétaire des
-- tables (superuser en dev, donc BYPASSRLS), et le rôle applicatif doit exister
-- (0008) avant que quiconque ne dépende des politiques.
--
-- GUC transactionnel `app.organisation_id`, posé par withOrg (src/db/org-scope.ts) :
--   set_config('app.organisation_id', '<uuid>', true)  -- portée transaction
-- nullif(..., '') : sur une connexion du pool, après expiration d'un SET LOCAL, le
-- paramètre retombe à '' (chaîne vide) ; ''::uuid lèverait une erreur SQL alors que
-- NULL filtre toutes les lignes — « sans GUC → zéro ligne, pas d'erreur » (AD-4).

-- organisation : lisible publiquement (résolution du slug par défaut avant session,
-- ajustement documenté spec 1.9) ; écritures scopées à l'organisation courante.
ALTER TABLE organisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation FORCE ROW LEVEL SECURITY;
CREATE POLICY organisation_select_public ON organisation
  FOR SELECT USING (true);
CREATE POLICY organisation_insert_own ON organisation
  FOR INSERT
  WITH CHECK (id = nullif(current_setting('app.organisation_id', true), '')::uuid);
CREATE POLICY organisation_update_own ON organisation
  FOR UPDATE
  USING (id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.organisation_id', true), '')::uuid);

-- Tables métier : politique unique d'isolation par organisation (FR-27).
ALTER TABLE account ENABLE ROW LEVEL SECURITY;
ALTER TABLE account FORCE ROW LEVEL SECURITY;
CREATE POLICY account_org_isolation ON account FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE evenement ENABLE ROW LEVEL SECURITY;
ALTER TABLE evenement FORCE ROW LEVEL SECURITY;
CREATE POLICY evenement_org_isolation ON evenement FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE edition ENABLE ROW LEVEL SECURITY;
ALTER TABLE edition FORCE ROW LEVEL SECURITY;
CREATE POLICY edition_org_isolation ON edition FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE epreuve ENABLE ROW LEVEL SECURITY;
ALTER TABLE epreuve FORCE ROW LEVEL SECURITY;
CREATE POLICY epreuve_org_isolation ON epreuve FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE coureur ENABLE ROW LEVEL SECURITY;
ALTER TABLE coureur FORCE ROW LEVEL SECURITY;
CREATE POLICY coureur_org_isolation ON coureur FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE document ENABLE ROW LEVEL SECURITY;
ALTER TABLE document FORCE ROW LEVEL SECURITY;
CREATE POLICY document_org_isolation ON document FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE preuve ENABLE ROW LEVEL SECURITY;
ALTER TABLE preuve FORCE ROW LEVEL SECURITY;
CREATE POLICY preuve_org_isolation ON preuve FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY email_outbox_org_isolation ON email_outbox FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

-- session / login_code : exception documentée (spec 1.9, Design Notes) — cherchées
-- par secret (token / hash de code) avant que l'organisation soit connue. RLS activé
-- avec politiques permissives : l'isolation organisation s'exerce sur account et
-- toutes les tables métier ; le token est le contrôle d'accès de la session.
ALTER TABLE login_code ENABLE ROW LEVEL SECURITY;
CREATE POLICY login_code_permissive_select ON login_code
  FOR SELECT USING (true);
CREATE POLICY login_code_permissive_insert ON login_code
  FOR INSERT WITH CHECK (true);
CREATE POLICY login_code_permissive_update ON login_code
  FOR UPDATE USING (true) WITH CHECK (true);

ALTER TABLE session ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_permissive_select ON session
  FOR SELECT USING (true);
CREATE POLICY session_permissive_insert ON session
  FOR INSERT WITH CHECK (true);
CREATE POLICY session_permissive_update ON session
  FOR UPDATE USING (true) WITH CHECK (true);

-- schema_migrations : exemptée de RLS — jamais lue par l'application, gérée en
-- propriétaire par le runner.
