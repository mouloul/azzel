-- Story 5.2 — barrières horaires par checkpoint : la sécurité des coureurs
-- exige un seuil EXPLICITE (« attendu au km 12 avant 10:00 »), jamais deviné.
-- `mission.barriere_le` facultatif (NULL = pas d'alerte pour ce checkpoint),
-- porté par la mission scan_checkpoint uniquement (garde domaine : erreur
-- champ sur les autres types).
--
-- CHECK same-row (calque fin_le > debut_le, 0020) : la barrière vit DANS la
-- mission, bornes incluses (debut_le ≤ barriere_le ≤ fin_le). La règle est
-- d'abord une ERREUR CHAMP du domaine (création/édition admin) ; ce CHECK
-- n'est qu'un filet — aucune écriture légitime ne peut le violer. Pas
-- d'index : l'agrégation etatCourse (polling 5 s) lit déjà toutes les
-- missions scan_checkpoint de l'édition, la barrière arrive avec la ligne.

ALTER TABLE mission ADD COLUMN barriere_le timestamptz;

ALTER TABLE mission ADD CONSTRAINT mission_barriere_bornees
  CHECK (barriere_le IS NULL OR (barriere_le >= debut_le AND barriere_le <= fin_le));
