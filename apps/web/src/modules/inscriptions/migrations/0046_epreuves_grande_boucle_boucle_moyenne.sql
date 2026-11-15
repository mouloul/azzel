-- Retour comité 2027 (point 2) : les deux épreuves changent de nom dans toute
-- l'application. « La Longue » devient « La Grande Boucle », « La Moyenne »
-- devient « La Boucle Moyenne ». Les slugs (longue, moyenne) ne bougent pas :
-- ils servent de clés (parcours.json, contenus, heures de départ, URL).
--
-- Mise à jour conditionnée au libellé semé par 0040 : une épreuve renommée à
-- la main par l'organisation n'est pas écrasée.

UPDATE epreuve
SET name = 'La Grande Boucle'
WHERE slug = 'longue' AND name = 'La Longue';

UPDATE epreuve
SET name = 'La Boucle Moyenne'
WHERE slug = 'moyenne' AND name = 'La Moyenne';
