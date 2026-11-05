-- Les noms d'épreuves ne portent plus la distance, et la longue s'aligne sur
-- le relevé GPX.
--
-- Revue visuelle du 04/11/2026 (B1) : la fiche de l'accueil affichait le titre
-- « LA LONGUE — 35 KM » et, trois lignes plus bas, « Distance 28 km ». Le 35
-- venait du nom semé par 0002 ; le 28 du relevé d'essai publié dans
-- parcours.json. Les deux chiffres se touchaient à l'écran.
--
-- Décision du PO (2026-11-05) : les chiffres publiés suivent le relevé GPX du
-- POC, qui sera à 90 % le tracé réel, aux ajustements près.
--
-- Deux corrections distinctes :
--
-- 1. La distance SORT du nom. Une distance figée dans un libellé redevient
--    fausse au premier ajustement du tracé, et personne ne pense à la changer.
--    Le nom dit l'épreuve, la distance vient de sa source — parcours.json
--    quand le relevé existe, la colonne distance_km sinon.
--
-- 2. distance_km de la longue passe de 35,0 à 28,0, la valeur du relevé. Les
--    surfaces qui lisent la colonne plutôt que le relevé (formulaire
--    d'inscription, e-dossard) cessent d'annoncer 35.
--
-- La moyenne garde 12,0 : son tracé n'est pas défini (12 à 15 km attendus).
-- Elle reçoit dans parcours.json une DUPLICATION provisoire du relevé de la
-- longue, pour que les stories 11.3 et 11.5 disposent de deux épreuves ; sa
-- fiche publique porte la mention « tracé provisoire ». À remplacer dès que
-- l'organisation fournit le tracé court.
--
-- Mise à jour conditionnée au libellé semé : une épreuve renommée à la main
-- par l'organisation n'est pas écrasée.

UPDATE epreuve
SET name = 'La Longue', distance_km = 28.0
WHERE slug = 'longue' AND name = 'La Longue — 35 km';

UPDATE epreuve
SET name = 'La Moyenne'
WHERE slug = 'moyenne' AND name = 'La Moyenne — 12 km';
