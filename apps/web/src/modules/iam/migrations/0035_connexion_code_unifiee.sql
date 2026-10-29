-- Story 3.1 (rouverte, SCP 2026-10-28) — connexion par code unifiée, tous rôles.
--
-- Les volontaires se connectent désormais comme coureurs et organisateurs :
-- email + code de vérification sur /connexion (story 1.2). Le flux mot de passe
-- (scrypt) et le jeton d'invitation disparaissent :
--
--   * account.activated_at : première connexion réussie (posée par l'upsert de
--     verifyCodeAndStartSession, COALESCE — jamais réécrite). Backfill depuis
--     l'ancien password_set_at, à défaut la consommation de l'invitation.
--   * volontaire.invitation_outbox_id : la DERNIÈRE ligne email_outbox
--     d'invitation du volontaire — source unique du statut affiché côté admin
--     (en file / envoyée / échec). Backfill depuis la dernière invitation.
--   * purge des jetons bruts : les payloads 'invitation_volontaire' ne portent
--     plus que { nom } (le jeton brut y persistait indéfiniment).
--   * DROP de la table invitation et des colonnes password_hash/password_set_at.
--
-- Le type d'email 'invitation_volontaire' est CONSERVÉ (CHECK 0016/0031).
-- Migration nouvelle : 0017/0018 ne sont jamais éditées (migrateur sans checksum).

ALTER TABLE account ADD COLUMN activated_at timestamptz;

UPDATE account a
SET activated_at = COALESCE(
  a.password_set_at,
  (SELECT max(i.consomme_le) FROM invitation i WHERE i.account_id = a.id)
)
WHERE a.activated_at IS NULL
  AND (
    a.password_set_at IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM invitation i WHERE i.account_id = a.id AND i.consomme_le IS NOT NULL
    )
  );

ALTER TABLE volontaire
  ADD COLUMN invitation_outbox_id uuid REFERENCES email_outbox (id) ON DELETE SET NULL;

UPDATE volontaire v
SET invitation_outbox_id = (
  SELECT i.email_outbox_id
  FROM invitation i
  WHERE i.account_id = v.account_id
    AND i.organisation_id = v.organisation_id
  ORDER BY i.created_at DESC
  LIMIT 1
);

UPDATE email_outbox
SET payload = payload - 'jeton'
WHERE type = 'invitation_volontaire'
  AND payload ? 'jeton';

DROP TABLE invitation;

ALTER TABLE account DROP COLUMN password_hash;
ALTER TABLE account DROP COLUMN password_set_at;
