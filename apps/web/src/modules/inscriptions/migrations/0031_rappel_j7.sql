-- Story 6.4 — rappel batterie J-7 : la file d'envoi existante porte un nouveau
-- type. Le CHECK de 0016 (contrainte email_outbox_type_check) est remplacé par
-- la même liste + 'rappel_j7' : l'enfilement (cron `emails:j7`) est idempotent,
-- l'envoi reste best effort + rejeu par le worker existant.
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_type_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_type_check
  CHECK (type IN ('inscription_recue', 'dossier_valide', 'dossier_refuse', 'invitation_volontaire', 'rappel_j7'));

-- Idempotence J-7 : un seul rappel par destinataire et par organisation —
-- quelle que soit la fenêtre (J-7, rattrapage J-5…) ou le statut de la ligne
-- (pending, failed en backoff…), un rejeu du cron ne double JAMAIS l'envoi.
CREATE UNIQUE INDEX email_outbox_rappel_j7_unique
  ON email_outbox (organisation_id, destinataire)
  WHERE type = 'rappel_j7';
