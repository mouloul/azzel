-- Story 5.4 (AD-8, AD-3) — annulation auditable des passages.
--
-- annulation : événement de correction APPEND-ONLY. Un passage erroné (mauvais
-- scan, mauvais coureur) ne se supprime JAMAIS : il s'annule — l'événement
-- terrain reste INTACT dans terrain_evenement (la vérité brute, lisible pour
-- les rapports « passages annulés » de l'épopée 7), et l'annulation vit ICI
-- avec son audit complet : auteur (email de la session PC), horodatage de
-- réception SERVEUR et motif (1–500).
--
-- UNIQUE (evenement_id) : une annulation cible UN événement — l'idempotence
-- est structurelle (ON CONFLICT DO NOTHING côté store : rejouer « Confirmer »
-- est un succès « déjà annulé », jamais une seconde ligne). Les lectures
-- arbitrées (etatCourse, premierRecu, garde « déjà arrivé » de saisirAbandon)
-- excluent les événements annulés par NOT EXISTS : le ré-arbitrage « le
-- second passage fait foi » tombe des requêtes DISTINCT ON existantes, sans
-- jamais réécrire l'historique.
--
-- horodatage_reception = DEFAULT now() : l'heure d'audit vient de la BASE
-- (serveur SQL), jamais d'une valeur passée par l'applicatif — le store
-- n'insère que la traçabilité métier (organisation, événement, motif, auteur).
--
-- V1 : seuls les PASSAGES sont annulables (garde store — un retrait erroné
-- est une correction guichet, besoin séparé) ; aucune annulation d'abandon
-- (l'abandon est déclaratif).
--
-- RLS stricte pattern 0020 (TOUJOURS sous GUC) : un événement de l'org B est
-- introuvable côté A, structurellement.

-- Cohérence org STRUCTURELLE : la paire (id, organisation_id) de l'événement
-- devient UNIQUE — la FK COMPOSITE de annulation garantit en base que
-- l'annulation référence un événement de la MÊME organisation, au-delà du
-- seul GUC/RLS (un id devigné ne peut jamais croiser les orgs).
ALTER TABLE terrain_evenement
  ADD CONSTRAINT terrain_evenement_id_organisation_unique UNIQUE (id, organisation_id);

CREATE TABLE annulation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  evenement_id uuid NOT NULL,
  motif text NOT NULL CHECK (char_length(motif) BETWEEN 1 AND 500),
  auteur_email text NOT NULL CHECK (char_length(auteur_email) BETWEEN 1 AND 254),
  horodatage_reception timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evenement_id),
  FOREIGN KEY (evenement_id, organisation_id)
    REFERENCES terrain_evenement (id, organisation_id)
);

CREATE INDEX annulation_organisation_idx ON annulation (organisation_id);

ALTER TABLE annulation ENABLE ROW LEVEL SECURITY;
ALTER TABLE annulation FORCE ROW LEVEL SECURITY;
CREATE POLICY annulation_org_isolation ON annulation FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

-- Append-only VRAIMENT (calque 0028) : les DEFAULT PRIVILEGES (0008)
-- accordent SELECT/INSERT/UPDATE/DELETE à azzel_app sur toute nouvelle table —
-- un REVOKE explicite retire UPDATE/DELETE : le rôle applicatif ne peut NI
-- modifier NI supprimer une annulation, AD-8 est structurel.
REVOKE UPDATE, DELETE ON annulation FROM azzel_app;
GRANT SELECT, INSERT ON annulation TO azzel_app;
