ALTER TABLE coureur
  ADD CONSTRAINT coureur_decharge_pair_chk CHECK ((decharge_accepted_at IS NULL) = (decharge_version IS NULL)),
  ADD CONSTRAINT coureur_reglement_pair_chk CHECK ((reglement_accepted_at IS NULL) = (reglement_version IS NULL)),
  ADD CONSTRAINT coureur_acceptances_coherence_chk CHECK ((decharge_accepted_at IS NULL) = (reglement_accepted_at IS NULL));
