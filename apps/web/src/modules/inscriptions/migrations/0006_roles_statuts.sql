ALTER TABLE account
  ADD COLUMN role text NOT NULL DEFAULT 'coureur'
    CHECK (role IN ('coureur', 'organisateur'));

-- Statuts canoniques du dossier : « valide » (hérité des tests 1-3/1-4) devient « validé »,
-- tout statut inconnu rouvre le dossier avant que le CHECK ne s'applique (données legacy).
UPDATE coureur SET status = 'validé' WHERE status = 'valide';
UPDATE coureur SET status = 'en constitution'
  WHERE status NOT IN ('en constitution', 'validé', 'refusé');

ALTER TABLE coureur ADD COLUMN refusal_reason text;

ALTER TABLE coureur
  ADD COLUMN decided_by uuid REFERENCES account (id),
  ADD COLUMN decided_at timestamptz;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_status_chk CHECK (status IN ('en constitution', 'validé', 'refusé')),
  ADD CONSTRAINT coureur_refusal_reason_chk
    CHECK ((status = 'refusé') = (refusal_reason IS NOT NULL)),
  ADD CONSTRAINT coureur_refusal_reason_len_chk
    CHECK (refusal_reason IS NULL OR char_length(refusal_reason) <= 280);
