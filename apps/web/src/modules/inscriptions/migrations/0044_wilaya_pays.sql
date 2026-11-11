-- Provenance du coureur, et hébergement réservé aux participants venant d'une
-- autre wilaya que Tizi Ouzou (décision PO du 10/11/2026).
--
-- wilaya : code administratif à deux chiffres ('15' = Tizi Ouzou, 01 à 69),
-- ou 'ETR' pour un participant résidant à l'étranger. Le LIBELLÉ n'est jamais
-- stocké : il vit dans le code (provenance.ts).
-- Source des 69 wilayas : loi n° 26-06 modifiant la loi n° 84-09 relative à
-- l'organisation territoriale du pays, Journal officiel n° 25 de 2026 ;
-- numéros 59 à 69 publiés en novembre 2025.
-- pays : code ISO 3166-1 alpha-2 ('FR'), présent si et seulement si 'ETR'.
--
-- Colonnes NULLABLES, comme le genre (0034) : les dossiers existants n'ont
-- jamais eu à répondre. L'obligation vit dans le domaine, pour toute NOUVELLE
-- saisie ; les CHECK garantissent que la base refuse ce que le domaine refuse.
--
-- Aucune remise en cause des dossiers existants : un dossier sans wilaya qui
-- a déjà un hébergement le garde (NULL ne déclenche aucun CHECK) ; il devra
-- choisir sa wilaya à sa prochaine modification.

ALTER TABLE coureur
  ADD COLUMN IF NOT EXISTS wilaya text;

ALTER TABLE coureur
  ADD COLUMN IF NOT EXISTS pays text;

ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_wilaya_check;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_wilaya_check
  CHECK (wilaya IS NULL OR wilaya = 'ETR' OR wilaya ~ '^(0[1-9]|[1-5][0-9]|6[0-9])$');

ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_pays_check;

-- 'DZ' exclu : un résident d'Algérie choisit sa wilaya, pas « Étranger ».
ALTER TABLE coureur
  ADD CONSTRAINT coureur_pays_check
  CHECK (pays IS NULL OR (pays ~ '^[A-Z]{2}$' AND pays <> 'DZ'));

-- Pays si et seulement si étranger. Écrit en CASE pour que wilaya NULL
-- (dossier ancien) exige aussi pays NULL : une égalité de booléens laisserait
-- passer un pays sans wilaya (NULL = true donne NULL, donc accepté).
ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_pays_etranger_check;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_pays_etranger_check
  CHECK (CASE WHEN wilaya = 'ETR' THEN pays IS NOT NULL ELSE pays IS NULL END);

ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_hebergement_hors_tizi_check;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_hebergement_hors_tizi_check
  CHECK (NOT (wilaya = '15' AND hebergement));
