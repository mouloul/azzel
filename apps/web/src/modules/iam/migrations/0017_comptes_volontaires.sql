-- Story 3.1 — comptes volontaires : rôle, mot de passe scrypt, invitations.
--
-- Rôle unique par compte (note Winston 1.6/1.9) : le CHECK de 0006 est élargi à
-- 'volontaire' — un compte EST coureur, organisateur ou volontaire, jamais deux.
-- Le mot de passe n'existe que pour les volontaires (connexion coureur/orga =
-- code email) : colonnes nullables, hash scrypt posé à l'activation.
--
-- invitation : jeton brut 32 octets (base64url) dans le lien, stocké HASHÉ
-- sha256 (pattern login_code) ; TTL 14 jours (expire_le) ; consommée à l'usage
-- (consomme_le) ; une nouvelle invitation révoque les précédentes non
-- consommées (DELETE par le store, même transaction). email_outbox_id relie
-- l'invitation à sa ligne de file d'envoi : le statut affiché côté admin vient
-- directement de l'outbox — pas de double source de vérité.
--
-- RLS : pattern 0011 (login_code/session). L'invitation est cherchée par secret
-- (jeton_hash) AVANT que l'organisation soit connue — la page publique
-- /invitation?jeton=… n'a ni session ni organisation. GUC posé → seules les
-- lignes de l'organisation courante ; GUC absent → toutes les lignes (le jeton
-- est le contrôle d'accès, exactement comme le token de session).

ALTER TABLE account DROP CONSTRAINT account_role_check;
ALTER TABLE account ADD CONSTRAINT account_role_check
  CHECK (role IN ('coureur', 'organisateur', 'volontaire'));

ALTER TABLE account ADD COLUMN password_hash text;
ALTER TABLE account ADD COLUMN password_set_at timestamptz;

CREATE TABLE invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  account_id uuid NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  jeton_hash text NOT NULL UNIQUE,
  email_outbox_id uuid NOT NULL REFERENCES email_outbox (id),
  expire_le timestamptz NOT NULL,
  consomme_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invitation_account_pending_idx ON invitation (account_id)
  WHERE consomme_le IS NULL;

ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_org_isolation ON invitation FOR ALL
  USING (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  )
  WITH CHECK (
    nullif(current_setting('app.organisation_id', true), '') IS NULL
    OR organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid
  );

-- Pas de DELETE applicatif (la révocation passe par le store en UPDATE/DELETE ;
-- le store révoque via DELETE des invitations non consommées).
GRANT SELECT, INSERT, UPDATE, DELETE ON invitation TO azzel_app;
