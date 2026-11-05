-- Expiration de l'inscription faute de preuve de paiement.
--
-- Une inscription réserve une place. Sans preuve déposée avant la fin du
-- surlendemain (heure d'Alger), elle expire et la place repart au pot.
--
-- preuve_due_at est FIGÉE à l'inscription, jamais recalculée : une échéance
-- qui bouge parce que le coureur a corrigé son téléphone serait injuste, et
-- impossible à tester. Nullable, car les inscriptions antérieures à cette
-- migration n'en ont jamais eu — et une limite absente ne fait JAMAIS expirer
-- (on ne libère pas une place sur une donnée manquante).
--
-- expired_at porte l'instant du constat. Le statut seul ne suffirait pas :
-- sans date, impossible de distinguer une expiration d'hier d'une expiration
-- du mois dernier, ni de répondre à un coureur qui conteste.
--
-- « expirée » rejoint les statuts autorisés. Elle n'occupe AUCUNE place : le
-- décompte ne compte que « en constitution » et « validé ».

ALTER TABLE coureur
  ADD COLUMN IF NOT EXISTS preuve_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz;

ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_status_chk;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_status_chk
  CHECK (status IN ('en constitution', 'validé', 'refusé', 'liste d’attente', 'expirée'));

-- Cohérence : un dossier expiré porte sa date de constat, et aucun autre
-- statut ne la porte. Même forme que la contrainte qui lie « refusé » à son
-- motif — un statut sans sa justification est un bug silencieux.
ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_expiration_coherence_chk;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_expiration_coherence_chk
  CHECK ((status = 'expirée') = (expired_at IS NOT NULL));

-- Le balayage cherche les dossiers en constitution dont l'échéance est
-- passée : un index partiel sur cette population suffit, elle est petite.
CREATE INDEX IF NOT EXISTS coureur_preuve_due_idx
  ON coureur (preuve_due_at)
  WHERE status = 'en constitution' AND preuve_due_at IS NOT NULL;

-- Deux nouveaux types d'email. La table n'a pas de colonne coureur_id :
-- l'idempotence passe par le payload, exactement comme le rappel J-7 (0031).
-- Un index unique partiel par coureur garantit qu'un rejeu du cron ne double
-- JAMAIS l'envoi, quel que soit l'état de la ligne (pending, failed, sent).
ALTER TABLE email_outbox
  DROP CONSTRAINT IF EXISTS email_outbox_type_check;

ALTER TABLE email_outbox
  ADD CONSTRAINT email_outbox_type_check
  CHECK (type IN (
    'inscription_recue', 'dossier_valide', 'dossier_refuse',
    'invitation_volontaire', 'rappel_j7',
    'rappel_preuve', 'inscription_expiree'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_rappel_preuve_unique
  ON email_outbox (organisation_id, (payload ->> 'coureurId'))
  WHERE type = 'rappel_preuve';

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_inscription_expiree_unique
  ON email_outbox (organisation_id, (payload ->> 'coureurId'))
  WHERE type = 'inscription_expiree';
