-- File d'envoi des notifications par email (story 1.8, FR-6) : chaque événement métier
-- (inscription reçue, dossier validé, dossier refusé) insère une ligne pending DANS la
-- transaction de l'événement ; l'envoi réel est différé (worker best effort + rejeu).
-- « sending » : revendication atomique par ligne avant envoi (pas de double envoi
-- concurrent) ; next_attempt_at : backoff entre tentatives après échec SMTP.
CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  destinataire text NOT NULL,
  type text NOT NULL CHECK (type IN ('inscription_recue', 'dossier_valide', 'dossier_refuse')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut text NOT NULL DEFAULT 'pending' CHECK (statut IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_outbox_statut_created_idx ON email_outbox (statut, created_at);
