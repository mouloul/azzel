-- Story 3.1 (revue) — statut 'cancelled' pour la file d'envoi.
-- Le renvoi d'invitation révoque l'invitation courante : son email, s'il est
-- encore pending/failed, ne doit PAS partir (le worker enverrait un lien au
-- jeton mort). Le store marque ces lignes 'cancelled' — le worker ne liste que
-- pending/failed/sending-abandonnées, elles ne repartent donc jamais. Une ligne
-- 'sent' reste envoyée (on ne peut pas défaire un envoi) ; une 'sending' en vol
-- garde sa course (fenêtre minuscule, jeton de toute façon mort).
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_statut_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_statut_check
  CHECK (statut IN ('pending', 'sending', 'sent', 'failed', 'cancelled'));
