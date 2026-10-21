CREATE TABLE IF NOT EXISTS document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation (id),
  slug text NOT NULL,
  version text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, slug),
  CHECK (slug IN ('decharge', 'reglement'))
);

INSERT INTO document (organisation_id, slug, version, content)
SELECT o.id, 'decharge', 'v1', $doc$
[TEXTE PROVISOIRE — à remplacer par l’organisateur avant l’ouverture des inscriptions.]

Décharge de bonne santé

Je soussigné(e) [Prénom NOM], participant(e) à l’édition [2027] du Trail d’Aït-Aïssi, déclare être en bonne santé générale et apte physiquement à participer à l’épreuve à laquelle je suis inscrit(e).

Je reconnais avoir pris connaissance des risques inhérents à la pratique du trail en milieu naturel et déclare assumer l’entière responsabilité de ma participation.

Je certifie l’exactitude des informations fournies lors de mon inscription et m’engage à signaler immédiatement tout changement de mon état de santé à l’organisateur.

[Ce texte n’a aucune valeur juridique tant qu’il n’a pas été remplacé par l’organisateur.]
$doc$
FROM organisation o
WHERE o.slug = 'ait-aissi'
ON CONFLICT (organisation_id, slug) DO NOTHING;

INSERT INTO document (organisation_id, slug, version, content)
SELECT o.id, 'reglement', 'v1', $doc$
[TEXTE PROVISOIRE — à remplacer par l’organisateur avant l’ouverture des inscriptions.]

Règlement intérieur

Article 1 — Inscriptions
Les inscriptions sont enregistrées en ligne et confirmées après acceptation de la décharge de bonne santé et du présent règlement. Les inscriptions sont closes à la date annoncée par l’organisateur.

Article 2 — Sécurité
Le port du dossard est obligatoire pendant toute la course. Chaque coureur doit respecter les consignes des organisateurs, signaleurs et secours présents sur le parcours.

Article 3 — Parcours
Le parcours doit être intégralement suivi. Tout abandon doit être signalé à un point de contrôle ou à l’organisateur.

Article 4 — Annulation
L’organisateur se réserve le droit de modifier ou d’annuler l’épreuve pour raisons de sécurité ou de force majeure, sans que les participants puissent prétendre à une indemnité.

[Ce texte n’a aucune valeur juridique tant qu’il n’a pas été remplacé par l’organisateur.]
$doc$
FROM organisation o
WHERE o.slug = 'ait-aissi'
ON CONFLICT (organisation_id, slug) DO NOTHING;

ALTER TABLE coureur ADD COLUMN IF NOT EXISTS decharge_accepted_at timestamptz;
ALTER TABLE coureur ADD COLUMN IF NOT EXISTS decharge_version text;
ALTER TABLE coureur ADD COLUMN IF NOT EXISTS reglement_accepted_at timestamptz;
ALTER TABLE coureur ADD COLUMN IF NOT EXISTS reglement_version text;
