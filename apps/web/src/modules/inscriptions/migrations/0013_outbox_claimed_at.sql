-- Story 1.8 (correctif) — bail de revendication de la file d'envoi.
-- claimOutboxRow passe la ligne à « sending » avant l'envoi SMTP. Si le process
-- meurt entre la revendication et markOutboxSent/markOutboxFailed, la ligne restait
-- bloquée en « sending » à vie : email jamais envoyé, jamais rejoué, invisible du CLI.
-- claimed_at horodate la revendication : au-delà du bail (OUTBOX_CLAIM_LEASE_MINUTES,
-- outbox-store.ts), la ligne est considérée abandonnée — la file la reprend et le CLI
-- la compte en impasse quand ses tentatives sont épuisées.
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Lignes « sending » héritées d'avant ce correctif : claimed_at NULL est traité comme
-- un bail déjà expiré par listOutstanding, elles repartiront au prochain passage.

-- La file cherche désormais aussi les « sending » abandonnées par ordre de bail.
CREATE INDEX IF NOT EXISTS email_outbox_sending_claimed_idx
  ON email_outbox (claimed_at)
  WHERE statut = 'sending';
