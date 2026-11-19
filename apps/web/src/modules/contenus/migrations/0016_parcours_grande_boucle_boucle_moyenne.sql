-- Retour comité 2027 (point 2) : les contenus éditoriaux des parcours suivent
-- les nouveaux noms d'épreuves (« La Grande Boucle », « La Boucle Moyenne »).
--
-- Mise à jour conditionnée au titre posé par 0015 : un titre déjà retouché
-- depuis /admin/contenus n'est pas écrasé.

UPDATE contenu_vitrine
SET titre = 'La Grande Boucle'
WHERE slug = 'parcours-longue' AND titre = 'Trail long';

UPDATE contenu_vitrine
SET titre = 'La Boucle Moyenne'
WHERE slug = 'parcours-moyenne' AND titre = 'Trail moyen';
