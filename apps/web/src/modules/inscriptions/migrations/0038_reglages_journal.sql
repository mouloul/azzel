-- Journal des changements de réglages d'édition.
--
-- Passer la capacité de 600 à 1000 est une décision d'organisation, pas un
-- détail technique : six mois plus tard, personne ne saura qui a ouvert le
-- palier, quand, ni depuis quelle valeur. Sans journal, la seule trace serait
-- l'état courant — qui ne dit rien de son histoire.
--
-- Une ligne PAR CHAMP modifié, pas par formulaire envoyé : un enregistrement
-- qui ne change que le seuil ne doit pas laisser croire que la capacité a
-- bougé aussi.
--
-- modifie_par référence `account` : la session organisateur est connue au
-- moment de l'écriture. ON DELETE SET NULL plutôt que CASCADE — supprimer un
-- compte ne doit pas effacer l'histoire des décisions prises.

CREATE TABLE IF NOT EXISTS edition_reglage_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  edition_id uuid NOT NULL REFERENCES edition (id),
  champ text NOT NULL,
  ancienne_valeur integer NOT NULL,
  nouvelle_valeur integer NOT NULL,
  modifie_par uuid REFERENCES account (id) ON DELETE SET NULL,
  modifie_le timestamptz NOT NULL DEFAULT now(),
  CHECK (ancienne_valeur <> nouvelle_valeur)
);

CREATE INDEX IF NOT EXISTS edition_reglage_journal_edition_idx
  ON edition_reglage_journal (edition_id, modifie_le DESC);

ALTER TABLE edition_reglage_journal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS edition_reglage_journal_org_isolation ON edition_reglage_journal;

-- Expression RECOPIÉE des policies existantes (coureur, edition…) : le GUC est
-- `app.organisation_id`, et le NULLIF est indispensable — hors transaction
-- scopée, current_setting rend '' et un cast direct en uuid lèverait au lieu
-- de simplement ne rien laisser passer.
CREATE POLICY edition_reglage_journal_org_isolation ON edition_reglage_journal
  FOR ALL
  USING (
    organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid
  );

GRANT SELECT, INSERT ON edition_reglage_journal TO azzel_app;
