-- Story 7.1 (FR-15, AD-3, NFR-4) — heures de départ officielles par épreuve.
-- (Vit dans inscriptions/migrations : la table epreuve appartient à ce module
-- — le runner suit les migrations PAR NOM, le numéro 0033 reste unique.)
--
-- UNE colonne sur epreuve suffit aux départs échelonnés : chaque épreuve porte
-- SA référence horaire (nullable : jamais configurée = classement « à
-- configurer », jamais de temps faux à zéro). Le temps de classement vit
-- ENTIEREMENT en lecture : réception serveur du premier passage ARRIVÉE
-- arbitré (AD-3) − heure_depart — le scan de départ n'entre JAMAIS dans le
-- calcul.
--
-- CHECK de cohérence minimale : NULL (non configurée) ou strictement
-- postérieure à 2000-01-01 — un horodatage aberrant (1970, epoch 0) ne peut
-- pas se faire passer pour une heure de course. La validation de forme (ISO,
-- borne) vit AUSSI côté service (erreur champ 400), le CHECK reste la défense
-- en profondeur.
--
-- RLS inchangée : la ligne epreuve existe déjà (policy epreuve_org_isolation
-- 0009, FOR ALL — l'UPDATE y est couvert) et les grants applicatifs viennent
-- de 0008 (SELECT/INSERT/UPDATE/DELETE sur epreuve). Rien à re-granter :
-- l'heure de départ reste éditable uniquement par un organisateur via la
-- garde admin de la route, sous GUC organisation.

ALTER TABLE epreuve
  ADD COLUMN heure_depart timestamptz
  CONSTRAINT epreuve_heure_depart_coherente
  CHECK (heure_depart IS NULL OR heure_depart > TIMESTAMPTZ '2000-01-01T00:00:00Z');
