-- Genre du coureur, majorité obligatoire, et disparition de la catégorie U20.
--
-- genre NULLABLE, et c'est délibéré : les inscriptions déjà enregistrées n'ont
-- jamais eu à répondre à cette question. Une colonne NOT NULL casserait la
-- migration, et un défaut arbitraire ('H') inventerait une donnée personnelle
-- que personne n'a saisie. L'obligation vit dans le domaine
-- (validateInscriptionInput), qui s'applique à toute NOUVELLE saisie ; le
-- CHECK garantit seulement qu'aucune valeur hors liste n'entre en base.
--
-- U20 (moins de 20 ans) disparaît : les épreuves étant réservées aux majeurs,
-- cette catégorie ne couvrirait plus que 18 et 19 ans. Senior devient 18–39.
-- Les lignes existantes sont REMAPPÉES AVANT de resserrer la contrainte —
-- l'ordre inverse ferait échouer la migration sur la première ligne U20.
--
-- La borne d'âge passe de 10 à 18 ans. Si des dossiers de mineurs existent,
-- la migration DOIT échouer bruyamment plutôt que les laisser en base en
-- violation de la règle : le bloc de contrôle ci-dessous les compte et lève
-- une exception nommée, avec le nombre exact de dossiers à traiter à la main.

ALTER TABLE coureur
  ADD COLUMN IF NOT EXISTS genre text;

ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_genre_check;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_genre_check CHECK (genre IS NULL OR genre IN ('F', 'H'));

UPDATE coureur SET age_category = 'Senior' WHERE age_category = 'U20';

ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_age_category_check;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_age_category_check
  CHECK (age_category IN ('Senior', 'V1', 'V2', 'V3'));

DO $$
DECLARE
  mineurs integer;
BEGIN
  SELECT count(*) INTO mineurs FROM coureur WHERE age < 18;
  IF mineurs > 0 THEN
    RAISE EXCEPTION
      'Majorite obligatoire : % dossier(s) de moins de 18 ans en base. Traiter ces dossiers (remboursement, suppression) avant de rejouer cette migration.',
      mineurs;
  END IF;
END
$$;

ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_age_check;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_age_check CHECK (age BETWEEN 18 AND 100);
