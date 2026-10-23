-- Story 5.1 — checkpoint d'arrivée : la carte « Arrivés » du PC course exige
-- un point d'arrivée IDENTIFIÉ, jamais deviné. `mission.est_arrivee` donne au
-- PC ce levier explicite sur une mission scan_checkpoint existante.
--
-- L'unicité « au plus UN par édition » est une règle MÉTIER gardée par le
-- service missions (edition via secteur, erreur champ claire) : mission n'a pas
-- de edition_id direct et une contrainte SQL partielle croisée secteur serait
-- une expression fragile (FK non résolu) — la garde applicative verrouille la
-- ligne édition en transaction (aucune fenêtre de course).
--
-- Index PARTIEL : la lecture « checkpoint d'arrivée de l'org » (agrégation
-- etatCourse, polling 5 s) ne touche que les rares lignes cochées.

ALTER TABLE mission ADD COLUMN est_arrivee boolean NOT NULL DEFAULT false;

CREATE INDEX mission_est_arrivee_idx ON mission (organisation_id) WHERE est_arrivee;
