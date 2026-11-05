-- Comptes de l'événement où le coureur verse son dossard (CCP, Baridimob).
--
-- Texte libre, facultatif : l'organisation les saisit depuis l'administration
-- et la page de dépôt de preuve ne les affiche que s'ils existent. Ce ne sont
-- pas des réglages numériques : ils restent hors du journal des réglages, qui
-- ne stocke que des entiers.

ALTER TABLE edition
  ADD COLUMN IF NOT EXISTS compte_ccp text,
  ADD COLUMN IF NOT EXISTS compte_baridimob text,
  ADD COLUMN IF NOT EXISTS titulaire_compte text;
