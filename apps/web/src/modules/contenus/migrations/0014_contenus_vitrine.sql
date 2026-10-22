-- Story 2.4 — contenus vitrine éditables (parcours, consignes, région) + GPX.
-- contenu_vitrine : bloc de texte éditable par l'organisateur (slug, titre, corps
-- texte simple — jamais de HTML), lu dynamiquement par les pages publiques
-- /parcours et /region : chaque modification est visible au rechargement, sans
-- redéploiement (FR-21/FR-23).
-- epreuve.gpx_url : URL facultative du tracé GPX par épreuve, fournie par
-- l'admin (aucun upload) et rendue en lien révélé au clic (chargement différé
-- structurel — la carte interactive reste la décision de l'épopée 7).
-- RLS : même politique d'isolation que 0009/0010, posée ici car la table naît
-- après elles (le runner applique 0014 en propriétaire, comme le reste).

CREATE TABLE contenu_vitrine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  slug text NOT NULL,
  titre text NOT NULL CHECK (char_length(titre) BETWEEN 1 AND 120),
  corps text NOT NULL CHECK (char_length(corps) BETWEEN 1 AND 20000),
  -- Précision milliseconde (date_trunc) : la version fait l'aller-retour
  -- client (ISO) → JS Date (ms) → SQL sans perte — condition du verrou
  -- optimiste (updated_at = version_lue), now() brut est à la microseconde.
  updated_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  UNIQUE (organisation_id, slug)
);

-- gpx_url : https exclusivement (défense en profondeur contre le XSS stocké —
-- javascript: ne passe pas la contrainte, même en écriture SQL directe),
-- longueur plafonnée. L'application valide aussi (domain.isHttpsUrl) et le
-- rendu public ne tient l'URL pour sûre que si elle est https.
ALTER TABLE epreuve ADD COLUMN IF NOT EXISTS gpx_url text;
ALTER TABLE epreuve DROP CONSTRAINT IF EXISTS epreuve_gpx_url_max_length;
ALTER TABLE epreuve DROP CONSTRAINT IF EXISTS epreuve_gpx_url_valide;
ALTER TABLE epreuve
  ADD CONSTRAINT epreuve_gpx_url_valide
  CHECK (gpx_url IS NULL OR (char_length(gpx_url) <= 2048 AND gpx_url ~ '^https://'));

ALTER TABLE contenu_vitrine ENABLE ROW LEVEL SECURITY;
ALTER TABLE contenu_vitrine FORCE ROW LEVEL SECURITY;
CREATE POLICY contenu_vitrine_org_isolation ON contenu_vitrine FOR ALL
  USING (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true), '')::uuid);

-- Grants applicatifs explicites (défense en profondeur, voir 0010) ; epreuve
-- est déjà accordée à azzel_app (0008) — la colonne hérite des droits table.
GRANT SELECT, INSERT, UPDATE, DELETE ON contenu_vitrine TO azzel_app;

-- Seeds provisoires balisés « à confirmer par le comité » pour les faits 2027
-- (CHARTE.md : ne jamais inventer de chiffres). L'organisateur les remplace
-- depuis /admin/contenus sans développeur.
INSERT INTO contenu_vitrine (organisation_id, slug, titre, corps)
SELECT o.id, v.slug, v.titre, v.corps
FROM organisation o
CROSS JOIN (VALUES
  (
    'parcours-longue',
    'Trail long — 35 km',
    'L’épreuve phare de l’édition 2027, au départ du stade Agni Lhoudh, sur les sentiers de la forêt de Yakouren.

Dénivelé positif : à confirmer par le comité.
Horaire de départ : à confirmer par le comité.
Ravitaillements : à confirmer par le comité.'
  ),
  (
    'parcours-moyenne',
    'Trail moyen — 12 km',
    'Une distance plus courte, le même jour, au départ du stade Agni Lhoudh.

Dénivelé positif : à confirmer par le comité.
Horaire de départ : à confirmer par le comité.
Ravitaillements : à confirmer par le comité.'
  ),
  (
    'consignes-securite',
    'Consignes de sécurité',
    'Ne défiez pas la montagne : préparez votre course, emportez de l’eau et habillez-vous selon la météo du jour.

Restez sur les sentiers balisés et suivez les consignes des bénévoles poste par poste.

Les singes sacrés du Jurjura sont des animaux sauvages : ne les nourrissez pas et gardez vos distances.

En cas de difficulté, appelez l’équipe de la course.'
  ),
  (
    'region',
    'Aït Aïssi et la forêt de Yakouren',
    'Le village d’Aït Aïssi se situe dans la commune de Yakouren, en Kabylie, au pied du massif du Jurjura.

Le week-end de la course, le village vous accueille : coureurs, familles et bénévoles s’y retrouvent.'
  ),
  (
    'hebergement',
    'Hébergement',
    'La liste des hébergements partenaires sera publiée ici : à confirmer par le comité.

Vous trouverez des possibilités d’hébergement à Yakouren et dans les communes voisines.'
  ),
  (
    'restauration',
    'Restauration',
    'La restauration du week-end sera proposée au village du stade Agni Lhoudh.

Horaires et partenaires : à confirmer par le comité.'
  ),
  (
    'annexes',
    'Événements annexes',
    'Le programme des événements annexes — Course Kids et animations au village — sera publié ici.

À confirmer par le comité.'
  )
) AS v(slug, titre, corps)
WHERE o.slug = 'ait-aissi'
ON CONFLICT (organisation_id, slug) DO NOTHING;
