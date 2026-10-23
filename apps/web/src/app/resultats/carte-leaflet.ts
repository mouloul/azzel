// Story 7.3 — point d'entrée UNIQUE de Leaflet dans la vitrine. Ce module
// n'est JAMAIS importé statiquement : carte-course.tsx le charge par import
// dynamique AU CLIC « Afficher la carte » — la lib (~42 Ko gz) et sa feuille
// de style vivent dans un chunk asynchrone, hors du HTML initial de
// /resultats et hors du bundle de la page (budget intouché, pare-chemin-
// critique). Le CSS de Leaflet voyage dans le MÊME chunk asynchrone.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export default L;
