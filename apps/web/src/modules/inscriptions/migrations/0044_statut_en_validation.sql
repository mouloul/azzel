-- Cycle de vie du dossier : « en validation », et reprise après refus ou
-- expiration (décision PO du 11/11/2026).
--
--   en constitution ── preuve déposée ──▶ en validation
--   en constitution ── échéance passée ──▶ expirée (place rendue)
--   en validation ──▶ validé | refusé (place rendue)
--   refusé / expirée ── « Modifier mon inscription » ──▶ en constitution | liste d'attente
--
-- « en validation » occupe une place (et son lit) et n'expire jamais : le
-- coureur a déposé dans les temps, c'est à l'organisation d'agir.
--
-- Rejouable : chaque contrainte est supprimée puis recréée, et la migration
-- des données ne touche que ce qui reste à migrer.

ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_status_chk;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_status_chk
  CHECK (status IN (
    'en constitution', 'en validation', 'validé', 'refusé', 'liste d’attente', 'expirée'
  ));

-- expired_at est CONSERVÉ quand un dossier expiré est repris : c'est la trace
-- de l'expiration, utile pour répondre à un coureur qui conteste. L'égalité
-- stricte de 0036 (« expirée » ⇔ expired_at posé) devient une implication :
-- un dossier expiré porte toujours sa date de constat, un dossier repris peut
-- la garder.
ALTER TABLE coureur
  DROP CONSTRAINT IF EXISTS coureur_expiration_coherence_chk;

ALTER TABLE coureur
  ADD CONSTRAINT coureur_expiration_coherence_chk
  CHECK (status <> 'expirée' OR expired_at IS NOT NULL);

-- Preuve « refusée » : à la reprise d'un dossier refusé, la preuve qui a
-- motivé le refus cesse d'être active SANS se confondre avec une preuve
-- simplement remplacée — c'est elle que le garde « fichier identique à la
-- preuve refusée » compare au nouveau dépôt.
ALTER TABLE preuve
  DROP CONSTRAINT IF EXISTS preuve_status_check;

ALTER TABLE preuve
  ADD CONSTRAINT preuve_status_check
  CHECK (status IN ('active', 'replaced', 'refusée'));

-- Données : un dossier en constitution qui a déjà une preuve active attend
-- l'organisation, pas le coureur. Idempotent : un second passage ne trouve
-- plus aucune ligne.
UPDATE coureur AS c
SET status = 'en validation',
    updated_at = now()
WHERE c.status = 'en constitution'
  AND EXISTS (
    SELECT 1 FROM preuve AS p
    WHERE p.coureur_id = c.id AND p.status = 'active'
  );

-- Emails « rappel_preuve » et « inscription_expiree » : dédoublonnés par
-- coureur ET par échéance. Par coureur seul (0036), un dossier repris qui
-- atteint une nouvelle échéance ne serait ni rappelé ni prévenu de son
-- expiration. Les lignes existantes reçoivent leur échéance AVANT la
-- recréation des index, sinon le prochain passage du cron renverrait un
-- rappel déjà envoyé (une clé NULL ne bloque aucun doublon).
UPDATE email_outbox
SET payload = payload || jsonb_build_object('echeance', payload ->> 'limite')
WHERE type = 'rappel_preuve'
  AND payload ->> 'echeance' IS NULL
  AND payload ->> 'limite' IS NOT NULL;

UPDATE email_outbox AS o
SET payload = o.payload || jsonb_build_object(
  'echeance',
  to_char(c.preuve_due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)
FROM coureur AS c
WHERE o.type = 'inscription_expiree'
  AND o.payload ->> 'echeance' IS NULL
  AND c.id::text = o.payload ->> 'coureurId'
  AND c.preuve_due_at IS NOT NULL;

DROP INDEX IF EXISTS email_outbox_rappel_preuve_unique;

CREATE UNIQUE INDEX email_outbox_rappel_preuve_unique
  ON email_outbox (organisation_id, (payload ->> 'coureurId'), (payload ->> 'echeance'))
  WHERE type = 'rappel_preuve';

DROP INDEX IF EXISTS email_outbox_inscription_expiree_unique;

CREATE UNIQUE INDEX email_outbox_inscription_expiree_unique
  ON email_outbox (organisation_id, (payload ->> 'coureurId'), (payload ->> 'echeance'))
  WHERE type = 'inscription_expiree';
