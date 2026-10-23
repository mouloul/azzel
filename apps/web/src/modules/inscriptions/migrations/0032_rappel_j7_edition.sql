-- Story 6.4 (revue) — idempotence J-7 scopée PAR ÉDITION : la course revient
-- chaque saison et un même destinataire doit recevoir le rappel de CHAQUE
-- édition (payload->>'dateCourse' distinct), sans doublon intra-saison. Le
-- prédicat d'index reste le type (l'index ne concerne que les rappels J-7).
DROP INDEX IF EXISTS email_outbox_rappel_j7_unique;
CREATE UNIQUE INDEX email_outbox_rappel_j7_edition_unique
  ON email_outbox (organisation_id, destinataire, (payload->>'dateCourse'))
  WHERE type = 'rappel_j7';
