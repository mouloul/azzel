-- Story 5.3 (FR-17, AD-3) — saisie des abandons au PC course.
--
-- abandon : événement de course APPEND-ONLY. Un coureur qui quitte la course
-- y est tracé UNE fois : UNIQUE (edition_id, jeton_coureur) arbitre les saisies
-- concurrentes (PC et secteur) — le PREMIER reçu serveur fait foi (AD-3), le
-- second reçoit « déjà abandonné » (ON CONFLICT DO NOTHING côté store).
-- Aucune édition ni suppression : une erreur de saisie sera corrigée par
-- l'annulation auditable (5.4), jamais en réécrivant l'historique.
--
-- horodatage = heure LOCALE du terrain convertie en ISO UTC par le client :
-- une DONNÉE déclarative (le PC note quand le secteur dit que ça s'est passé),
-- jamais un temps de classement (AD-3) ; horodatage_reception = heure SERVEUR
-- de la saisie (l'ordre d'arbitrage, calque terrain_evenement). auteur_email
-- trace le compte organisateur qui a saisi — l'auditabilité prime.
-- jeton_coureur SANS FK est un CHOIX calqué sur terrain_evenement (0025) :
-- l'audit survit à toute donnée amont (le jeton est une donnée d'archive,
-- pas une référence d'intégrité).
--
-- RLS stricte pattern 0020 (TOUJOURS sous GUC) : un dossard de l'org B est
-- introuvable côté A, structurellement.

CREATE TABLE abandon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  edition_id uuid NOT NULL REFERENCES edition (id),
  jeton_coureur text NOT NULL,
  lieu text NOT NULL CHECK (char_length(lieu) BETWEEN 1 AND 200),
  motif text NOT NULL CHECK (
    motif IN ('blessure', 'epuisement', 'hors_delais', 'abandon_volontaire', 'autre')
  ),
  horodatage timestamptz NOT NULL,
  auteur_email text NOT NULL CHECK (char_length(auteur_email) BETWEEN 1 AND 254),
  horodatage_reception timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition_id, jeton_coureur)
);

-- Arbitrage AD-3 : la clé naturelle (édition, coureur) EST l'index unique —
-- l'insertion concurrente y trouve son conflit sans lecture préalable.
CREATE INDEX abandon_organisation_idx ON abandon (organisation_id);

ALTER TABLE abandon ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandon FORCE ROW LEVEL SECURITY;
CREATE POLICY abandon_org_isolation ON abandon FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

-- Append-only VRAIMENT : les DEFAULT PRIVILEGES (0008) accordent
-- SELECT/INSERT/UPDATE/DELETE à azzel_app sur toute nouvelle table — les
-- grants s'AJOUTENT, ils ne restreignent pas. Un REVOKE explicite retire
-- UPDATE/DELETE : le rôle applicatif ne peut NI modifier NI supprimer un
-- abandon, l'annulation auditable (5.4) viendra par-dessus, jamais en
-- réécrivant.
REVOKE UPDATE, DELETE ON abandon FROM azzel_app;
GRANT SELECT, INSERT ON abandon TO azzel_app;
