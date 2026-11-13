-- Délai de dépôt de la preuve en HEURES (décision PO du 13/11/2026).
--
-- Le délai valait « J+N jours à 23h59, heure d'Alger » : selon l'heure
-- d'inscription, la réservation durait de 48 à 72 heures. Il devient une durée
-- glissante, en heures, qui part du moment où le dossier est rempli. 48 h par
-- défaut, réglable de 1 à 720 heures (30 jours) en administration.
--
-- Reprise des données : jours × 24, ramené dans les bornes (un délai de 0 jour
-- donnerait 0 heure, que la contrainte refuse). Les échéances déjà posées
-- (coureur.preuve_due_at) ne sont pas recalculées par cette migration. Seule
-- exception, à l'exécution : la PREMIÈRE acceptation de la décharge et du
-- règlement fait repartir l'échéance d'un dossier en constitution (même
-- inscrit sous l'ancienne règle) avec le délai en heures alors en vigueur.
--
-- Le journal des réglages n'est pas réécrit : ses lignes « delaiPreuveJours »
-- gardent leurs valeurs en jours, l'écran les présente sous un libellé dédié.
--
-- Rejouable : la colonne est ajoutée si absente, la reprise n'a lieu que tant
-- que la colonne en jours existe, chaque contrainte est supprimée puis
-- recréée, et la colonne en jours n'est supprimée que si elle existe encore.

ALTER TABLE edition
  ADD COLUMN IF NOT EXISTS delai_preuve_heures integer NOT NULL DEFAULT 48;

-- EXECUTE plutôt qu'un UPDATE en clair : au second passage la colonne en jours
-- n'existe plus, et la requête ne doit pas même être analysée.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'edition'
      AND column_name = 'delai_preuve_jours'
  ) THEN
    EXECUTE 'UPDATE edition
             SET delai_preuve_heures = LEAST(GREATEST(delai_preuve_jours * 24, 1), 720)';
  END IF;
END
$$;

-- La contrainte commune des réglages (0035) cite delai_preuve_jours :
-- supprimer la colonne la ferait disparaître EN ENTIER, emportant en silence
-- les garde-fous de la capacité et des prix. Elle est recréée sans le délai
-- AVANT la suppression de la colonne.
ALTER TABLE edition
  DROP CONSTRAINT IF EXISTS edition_reglages_check;

ALTER TABLE edition
  ADD CONSTRAINT edition_reglages_check CHECK (
    capacite >= 0
    AND seuil_affichage_places >= 0
    AND capacite_hebergement >= 0
    AND prix_dossard_da >= 0
    AND prix_hebergement_da >= 0
  );

ALTER TABLE edition
  DROP CONSTRAINT IF EXISTS edition_delai_preuve_heures_check;

ALTER TABLE edition
  ADD CONSTRAINT edition_delai_preuve_heures_check
  CHECK (delai_preuve_heures BETWEEN 1 AND 720);

ALTER TABLE edition
  DROP COLUMN IF EXISTS delai_preuve_jours;
