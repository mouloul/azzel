-- Numéro de transaction du versement (reçu CCP ou Baridimob).
--
-- Chaque coureur paie une fois, en un seul versement : un numéro de transaction
-- ne peut donc justifier qu'UN dossier. Sans cette contrainte, un même reçu
-- déposé sous deux comptes passerait pour deux paiements.
--
-- Facultatif en base : les preuves déposées avant cette colonne n'ont pas de
-- numéro. L'unicité ne porte que sur les preuves ACTIVES — une preuve remplacée
-- garde son numéro pour l'historique sans bloquer celui qui la remplace.

ALTER TABLE preuve
  ADD COLUMN IF NOT EXISTS numero_transaction text;

CREATE UNIQUE INDEX IF NOT EXISTS preuve_numero_transaction_actif_uidx
  ON preuve (organisation_id, numero_transaction)
  WHERE status = 'active' AND numero_transaction IS NOT NULL;
