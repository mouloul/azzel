-- Story 3.2 (revue) — défense en profondeur : le domaine limite déjà le
-- contact secteur à MAX_TELEPHONE_LENGTH (32, pattern 3.1) mais la colonne
-- SQL n'avait aucune borne — un INSERT direct pourrait poser 1 Mo de texte.
-- Symétrie avec les CHECK nom/lieu de 0020.

ALTER TABLE secteur ADD CONSTRAINT secteur_contact_len_check
  CHECK (contact IS NULL OR char_length(contact) <= 32);
