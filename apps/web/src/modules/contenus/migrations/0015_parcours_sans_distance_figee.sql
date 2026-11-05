-- Les fiches de parcours de la vitrine ne portent plus la distance dans leur
-- titre.
--
-- Même correction que 0040 côté inscriptions, pour les contenus éditoriaux :
-- « Trail long — 35 km » contredisait les 28 km du relevé d'essai publié par
-- parcours.json sur la même page (revue visuelle du 04/11/2026, défaut B1).
--
-- Une distance figée dans un titre redevient fausse au premier ajustement du
-- tracé. Le titre dit l'épreuve ; la distance vient de sa source et porte sa
-- mention « tracé provisoire ».
--
-- Mise à jour conditionnée au texte semé par 0014 : un titre déjà retouché
-- depuis /admin/contenus n'est pas écrasé.

UPDATE contenu_vitrine
SET titre = 'Trail long'
WHERE slug = 'parcours-longue' AND titre = 'Trail long — 35 km';

UPDATE contenu_vitrine
SET titre = 'Trail moyen'
WHERE slug = 'parcours-moyenne' AND titre = 'Trail moyen — 12 km';
