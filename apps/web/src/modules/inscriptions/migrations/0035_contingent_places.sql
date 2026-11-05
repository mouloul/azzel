-- Contingent de places par édition, seuil d'affichage, et statut « liste
-- d'attente ».
--
-- Les quatre réglages vivent sur `edition`, pas dans la configuration serveur :
-- l'organisation doit pouvoir passer de 600 à 1000 places sans redéploiement,
-- et deux éditions n'ont aucune raison de partager la même capacité.
--
-- Valeurs par défaut = ce qui a été annoncé : 600 dossards, compteur public à
-- partir de 200 places restantes (un tiers), 200 hébergements, 2000 DA le
-- dossard et 1500 DA l'hébergement. Les prix sont PROVISOIRES et réglables.
--
-- capacite_hebergement, prix_dossard_da, prix_hebergement_da et
-- delai_preuve_jours sont posés ici bien qu'exploités par les lots suivants :
-- une seule migration de réglages d'édition vaut mieux que quatre, et une
-- colonne par défaut inutilisée ne coûte rien.
--
-- CHECK sur chaque réglage : une capacité négative, un prix négatif ou un
-- délai négatif n'ont pas de sens et rendraient le décompte absurde. La
-- validation de forme vit AUSSI côté service ; le CHECK reste la défense en
-- profondeur.

ALTER TABLE edition
  ADD COLUMN IF NOT EXISTS capacite integer NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS seuil_affichage_places integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS capacite_hebergement integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS prix_dossard_da integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS prix_hebergement_da integer NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS delai_preuve_jours integer NOT NULL DEFAULT 2;

ALTER TABLE edition
  DROP CONSTRAINT IF EXISTS edition_reglages_check;

ALTER TABLE edition
  ADD CONSTRAINT edition_reglages_check CHECK (
    capacite >= 0
    AND seuil_affichage_places >= 0
    AND capacite_hebergement >= 0
    AND prix_dossard_da >= 0
    AND prix_hebergement_da >= 0
    AND delai_preuve_jours >= 0
  );

-- « liste d'attente » rejoint les statuts autorisés. Le contingent étant
-- atteint, l'inscription est enregistrée mais ne consomme aucune place et
-- n'appelle aucun versement : le coureur attend qu'une place lui soit
-- attribuée par l'organisation.
ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_status_chk;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_status_chk
  CHECK (status IN ('en constitution', 'validé', 'refusé', 'liste d’attente'));

-- Compter les places occupées est l'opération la plus fréquente du parcours
-- d'inscription : elle tourne sous verrou, à chaque envoi de formulaire.
CREATE INDEX IF NOT EXISTS coureur_edition_status_idx ON coureur (edition_id, status);
