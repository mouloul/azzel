-- Story 7.2 (FR-16, SM-5) — comptage ANONYME des visites partagées.
--
-- resultats_visite : UN agrégat par (organisation, édition, jour) — la mesure
-- de la « portée des partages » que lira le rapport 7.4. AUCUNE donnée
-- personnelle n'existe ici, structurellement : ni IP, ni user-agent, ni
-- session — seule la LIGNE compte (+1 par chargement de /resultats?partage=1,
-- le polling ne compte jamais). Pas de dédoublonnage voulu : trois
-- rechargements = trois visites (mesure de portée, pas d'audience unique).
--
-- L'écriture est un UPSERT applicatif (ON CONFLICT (organisation_id,
-- edition_id, jour) DO UPDATE SET visites = visites + 1) : la clé naturelle
-- arbitre structurellement les chargements concurrents, jamais de SELECT
-- préalable, jamais de ligne doublon.
--
-- jour date (sans heure) : la frontière du jour vient de l'horloge de la BASE
-- (CURRENT_DATE côté store) — la même source pour l'écriture et pour le
-- rapport 7.4, jamais d'interprétation client des fuseaux.
--
-- Limite ASSUMÉE : l'agrégat compte chaque chargement ?partage=1 — robots,
-- préchargements et rechargements humains y sont indissociables (aucun
-- user-agent stocké : l'anonymat prime, SM-5). C'est une mesure de portée
-- INDICATIVE pour le rapport 7.4, pas une audience unique.
--
-- RLS stricte pattern 0020 (TOUJOURS sous GUC) : les agrégats de l'org B sont
-- introuvables côté A, structurellement ; aucune lecture publique directe —
-- tout transite par le backend (AD-7).

CREATE TABLE resultats_visite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  edition_id uuid NOT NULL REFERENCES edition (id),
  jour date NOT NULL,
  visites integer NOT NULL CHECK (visites >= 0),
  UNIQUE (organisation_id, edition_id, jour)
);

ALTER TABLE resultats_visite ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultats_visite FORCE ROW LEVEL SECURITY;
CREATE POLICY resultats_visite_org_isolation ON resultats_visite FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

-- Compteur, pas registre : les DEFAULT PRIVILEGES (0008) accordent
-- SELECT/INSERT/UPDATE/DELETE à azzel_app sur toute nouvelle table — un REVOKE
-- explicite retire DELETE : un agrégat de portée ne se supprime jamais côté
-- applicatif (la correction éventuelle est une opération propriétaire, si
-- besoin). L'UPDATE reste : il EST l'upsert (+1).
REVOKE DELETE ON resultats_visite FROM azzel_app;
GRANT SELECT, INSERT, UPDATE ON resultats_visite TO azzel_app;
