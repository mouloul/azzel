-- Story 3.1 — invitations volontaires : la file d'envoi porte un nouveau type.
-- Le CHECK de 0007 (contrainte inline email_outbox_type_check) est remplacé par
-- la même liste + 'invitation_volontaire' : l'insertion se fait DANS la
-- transaction de l'import (cohérence), l'envoi reste best effort + rejeu.
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_type_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_type_check
  CHECK (type IN ('inscription_recue', 'dossier_valide', 'dossier_refuse', 'invitation_volontaire'));
