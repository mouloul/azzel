-- Hébergement optionnel, contingenté comme les dossards.
--
-- Le coureur coche l'option au formulaire ; le montant dû devient dossard +
-- hébergement, versé EN UNE FOIS avec une seule preuve et un seul délai. Deux
-- justificatifs à suivre doubleraient le travail de dépôt côté coureur et de
-- vérification côté équipe.
--
-- NOT NULL DEFAULT false : l'absence de demande est un fait connu, pas une
-- inconnue — contrairement au genre, que personne n'avait eu à renseigner.
--
-- Une place d'hébergement est occupée par les mêmes statuts qu'une place de
-- course (« en constitution », « validé ») : un dossier expiré ou refusé rend
-- son lit en même temps que son dossard.

ALTER TABLE coureur
  ADD COLUMN IF NOT EXISTS hebergement boolean NOT NULL DEFAULT false;

-- Le décompte des lits tourne sous verrou à chaque envoi de formulaire, au
-- même titre que celui des dossards : index partiel sur la seule population
-- qui en occupe un.
CREATE INDEX IF NOT EXISTS coureur_hebergement_idx
  ON coureur (edition_id)
  WHERE hebergement;
