/**
 * Provenance du coureur : wilaya d'Algérie, ou « Étranger » avec un pays.
 *
 * Référentiels isolés de domain.ts : deux listes longues, sans logique, que le
 * formulaire (composant CLIENT), le domaine et l'administration partagent. Rien
 * ici ne doit tirer le store ou le pilote Postgres.
 *
 * On stocke des CODES, jamais des libellés : un libellé corrigé (accent,
 * translittération) ne doit pas rendre illisibles les dossiers déjà saisis.
 */

/** Wilaya dont les participants n'ont pas accès à l'hébergement (décision PO, 10/11/2026). */
export const WILAYA_TIZI_OUZOU = '15';

/** Code stocké pour un participant résidant hors d'Algérie. */
export const WILAYA_ETRANGER = 'ETR';

export interface Wilaya {
  /** Code administratif à deux chiffres : '06', '15', '69'. */
  code: string;
  nom: string;
}

/**
 * Les 69 wilayas : les 58 historiques (codes 01-58 inchangés) et les 11
 * nouvelles (59-69). Ordre = ordre des codes, celui que tout Algérien connaît
 * par les plaques d'immatriculation.
 *
 * Source : loi n° 26-06 modifiant la loi n° 84-09 relative à l'organisation
 * territoriale du pays, Journal officiel n° 25 de 2026 (69 wilayas) ; numéros
 * 59 à 69 publiés en novembre 2025.
 */
export const WILAYAS: readonly Wilaya[] = [
  { code: '01', nom: 'Adrar' },
  { code: '02', nom: 'Chlef' },
  { code: '03', nom: 'Laghouat' },
  { code: '04', nom: 'Oum El Bouaghi' },
  { code: '05', nom: 'Batna' },
  { code: '06', nom: 'Béjaïa' },
  { code: '07', nom: 'Biskra' },
  { code: '08', nom: 'Béchar' },
  { code: '09', nom: 'Blida' },
  { code: '10', nom: 'Bouira' },
  { code: '11', nom: 'Tamanrasset' },
  { code: '12', nom: 'Tébessa' },
  { code: '13', nom: 'Tlemcen' },
  { code: '14', nom: 'Tiaret' },
  { code: '15', nom: 'Tizi Ouzou' },
  { code: '16', nom: 'Alger' },
  { code: '17', nom: 'Djelfa' },
  { code: '18', nom: 'Jijel' },
  { code: '19', nom: 'Sétif' },
  { code: '20', nom: 'Saïda' },
  { code: '21', nom: 'Skikda' },
  { code: '22', nom: 'Sidi Bel Abbès' },
  { code: '23', nom: 'Annaba' },
  { code: '24', nom: 'Guelma' },
  { code: '25', nom: 'Constantine' },
  { code: '26', nom: 'Médéa' },
  { code: '27', nom: 'Mostaganem' },
  { code: '28', nom: 'M’Sila' },
  { code: '29', nom: 'Mascara' },
  { code: '30', nom: 'Ouargla' },
  { code: '31', nom: 'Oran' },
  { code: '32', nom: 'El Bayadh' },
  { code: '33', nom: 'Illizi' },
  { code: '34', nom: 'Bordj Bou Arréridj' },
  { code: '35', nom: 'Boumerdès' },
  { code: '36', nom: 'El Tarf' },
  { code: '37', nom: 'Tindouf' },
  { code: '38', nom: 'Tissemsilt' },
  { code: '39', nom: 'El Oued' },
  { code: '40', nom: 'Khenchela' },
  { code: '41', nom: 'Souk Ahras' },
  { code: '42', nom: 'Tipaza' },
  { code: '43', nom: 'Mila' },
  { code: '44', nom: 'Aïn Defla' },
  { code: '45', nom: 'Naâma' },
  { code: '46', nom: 'Aïn Témouchent' },
  { code: '47', nom: 'Ghardaïa' },
  { code: '48', nom: 'Relizane' },
  { code: '49', nom: 'Timimoun' },
  { code: '50', nom: 'Bordj Badji Mokhtar' },
  { code: '51', nom: 'Ouled Djellal' },
  { code: '52', nom: 'Béni Abbès' },
  { code: '53', nom: 'In Salah' },
  { code: '54', nom: 'In Guezzam' },
  { code: '55', nom: 'Touggourt' },
  { code: '56', nom: 'Djanet' },
  { code: '57', nom: 'El M’Ghair' },
  { code: '58', nom: 'El Meniaa' },
  { code: '59', nom: 'Aflou' },
  { code: '60', nom: 'El Abiodh Sidi Cheikh' },
  { code: '61', nom: 'El Aricha' },
  { code: '62', nom: 'El Kantara' },
  { code: '63', nom: 'Barika' },
  { code: '64', nom: 'Bou Saâda' },
  { code: '65', nom: 'Bir El Ater' },
  { code: '66', nom: 'Ksar El Boukhari' },
  { code: '67', nom: 'Ksar Chellala' },
  { code: '68', nom: 'Aïn Oussara' },
  { code: '69', nom: 'Messaad' },
];

const NOM_WILAYA = new Map(WILAYAS.map((wilaya) => [wilaya.code, wilaya.nom]));

/** Code de wilaya connu (01-69). « ETR » n'en est pas un : voir estProvenanceValide. */
export function estWilayaConnue(code: string): boolean {
  return NOM_WILAYA.has(code);
}

/** Wilaya connue, ou « Étranger » : les seules réponses acceptées. */
export function estProvenanceValide(code: string): boolean {
  return code === WILAYA_ETRANGER || estWilayaConnue(code);
}

export interface Pays {
  /** Code ISO 3166-1 alpha-2 : 'FR', 'CA'. */
  code: string;
  nom: string;
}

/**
 * Pays de résidence proposés à un participant étranger : codes ISO 3166-1
 * alpha-2, libellés français, triés.
 *
 * Écrits EN DUR (générés une fois depuis Intl.DisplayNames('fr') de Node) et
 * non calculés au chargement : ce module est rendu côté serveur PUIS hydraté
 * dans le navigateur, et les données CLDR des deux moteurs diffèrent parfois
 * (« Turquie »/« Türkiye ») — libellés et ordre doivent être identiques.
 *
 * Exclus : l'Algérie (DZ — un résident choisit sa wilaya) et les territoires
 * sans population permanente (AQ, BV, GS, HM, IO, TF, UM).
 */
export const PAYS: readonly Pays[] = [
  { code: 'AF', nom: 'Afghanistan' },
  { code: 'ZA', nom: 'Afrique du Sud' },
  { code: 'AL', nom: 'Albanie' },
  { code: 'DE', nom: 'Allemagne' },
  { code: 'AD', nom: 'Andorre' },
  { code: 'AO', nom: 'Angola' },
  { code: 'AI', nom: 'Anguilla' },
  { code: 'AG', nom: 'Antigua-et-Barbuda' },
  { code: 'SA', nom: 'Arabie saoudite' },
  { code: 'AR', nom: 'Argentine' },
  { code: 'AM', nom: 'Arménie' },
  { code: 'AW', nom: 'Aruba' },
  { code: 'AU', nom: 'Australie' },
  { code: 'AT', nom: 'Autriche' },
  { code: 'AZ', nom: 'Azerbaïdjan' },
  { code: 'BS', nom: 'Bahamas' },
  { code: 'BH', nom: 'Bahreïn' },
  { code: 'BD', nom: 'Bangladesh' },
  { code: 'BB', nom: 'Barbade' },
  { code: 'BE', nom: 'Belgique' },
  { code: 'BZ', nom: 'Belize' },
  { code: 'BJ', nom: 'Bénin' },
  { code: 'BM', nom: 'Bermudes' },
  { code: 'BT', nom: 'Bhoutan' },
  { code: 'BY', nom: 'Biélorussie' },
  { code: 'BO', nom: 'Bolivie' },
  { code: 'BA', nom: 'Bosnie-Herzégovine' },
  { code: 'BW', nom: 'Botswana' },
  { code: 'BR', nom: 'Brésil' },
  { code: 'BN', nom: 'Brunei' },
  { code: 'BG', nom: 'Bulgarie' },
  { code: 'BF', nom: 'Burkina Faso' },
  { code: 'BI', nom: 'Burundi' },
  { code: 'KH', nom: 'Cambodge' },
  { code: 'CM', nom: 'Cameroun' },
  { code: 'CA', nom: 'Canada' },
  { code: 'CV', nom: 'Cap-Vert' },
  { code: 'CL', nom: 'Chili' },
  { code: 'CN', nom: 'Chine' },
  { code: 'CY', nom: 'Chypre' },
  { code: 'CO', nom: 'Colombie' },
  { code: 'KM', nom: 'Comores' },
  { code: 'CG', nom: 'Congo-Brazzaville' },
  { code: 'CD', nom: 'Congo-Kinshasa' },
  { code: 'KP', nom: 'Corée du Nord' },
  { code: 'KR', nom: 'Corée du Sud' },
  { code: 'CR', nom: 'Costa Rica' },
  { code: 'CI', nom: 'Côte d’Ivoire' },
  { code: 'HR', nom: 'Croatie' },
  { code: 'CU', nom: 'Cuba' },
  { code: 'CW', nom: 'Curaçao' },
  { code: 'DK', nom: 'Danemark' },
  { code: 'DJ', nom: 'Djibouti' },
  { code: 'DM', nom: 'Dominique' },
  { code: 'EG', nom: 'Égypte' },
  { code: 'AE', nom: 'Émirats arabes unis' },
  { code: 'EC', nom: 'Équateur' },
  { code: 'ER', nom: 'Érythrée' },
  { code: 'ES', nom: 'Espagne' },
  { code: 'EE', nom: 'Estonie' },
  { code: 'SZ', nom: 'Eswatini' },
  { code: 'VA', nom: 'État de la Cité du Vatican' },
  { code: 'US', nom: 'États-Unis' },
  { code: 'ET', nom: 'Éthiopie' },
  { code: 'FJ', nom: 'Fidji' },
  { code: 'FI', nom: 'Finlande' },
  { code: 'FR', nom: 'France' },
  { code: 'GA', nom: 'Gabon' },
  { code: 'GM', nom: 'Gambie' },
  { code: 'GE', nom: 'Géorgie' },
  { code: 'GH', nom: 'Ghana' },
  { code: 'GI', nom: 'Gibraltar' },
  { code: 'GR', nom: 'Grèce' },
  { code: 'GD', nom: 'Grenade' },
  { code: 'GL', nom: 'Groenland' },
  { code: 'GP', nom: 'Guadeloupe' },
  { code: 'GU', nom: 'Guam' },
  { code: 'GT', nom: 'Guatemala' },
  { code: 'GG', nom: 'Guernesey' },
  { code: 'GN', nom: 'Guinée' },
  { code: 'GQ', nom: 'Guinée équatoriale' },
  { code: 'GW', nom: 'Guinée-Bissau' },
  { code: 'GY', nom: 'Guyana' },
  { code: 'GF', nom: 'Guyane française' },
  { code: 'HT', nom: 'Haïti' },
  { code: 'HN', nom: 'Honduras' },
  { code: 'HU', nom: 'Hongrie' },
  { code: 'CX', nom: 'Île Christmas' },
  { code: 'IM', nom: 'Île de Man' },
  { code: 'NF', nom: 'Île Norfolk' },
  { code: 'AX', nom: 'Îles Åland' },
  { code: 'KY', nom: 'Îles Caïmans' },
  { code: 'CC', nom: 'Îles Cocos' },
  { code: 'CK', nom: 'Îles Cook' },
  { code: 'FO', nom: 'Îles Féroé' },
  { code: 'FK', nom: 'Îles Malouines' },
  { code: 'MP', nom: 'Îles Mariannes du Nord' },
  { code: 'MH', nom: 'Îles Marshall' },
  { code: 'PN', nom: 'Îles Pitcairn' },
  { code: 'SB', nom: 'Îles Salomon' },
  { code: 'TC', nom: 'Îles Turques-et-Caïques' },
  { code: 'VG', nom: 'Îles Vierges britanniques' },
  { code: 'VI', nom: 'Îles Vierges des États-Unis' },
  { code: 'IN', nom: 'Inde' },
  { code: 'ID', nom: 'Indonésie' },
  { code: 'IQ', nom: 'Irak' },
  { code: 'IR', nom: 'Iran' },
  { code: 'IE', nom: 'Irlande' },
  { code: 'IS', nom: 'Islande' },
  { code: 'IL', nom: 'Israël' },
  { code: 'IT', nom: 'Italie' },
  { code: 'JM', nom: 'Jamaïque' },
  { code: 'JP', nom: 'Japon' },
  { code: 'JE', nom: 'Jersey' },
  { code: 'JO', nom: 'Jordanie' },
  { code: 'KZ', nom: 'Kazakhstan' },
  { code: 'KE', nom: 'Kenya' },
  { code: 'KG', nom: 'Kirghizstan' },
  { code: 'KI', nom: 'Kiribati' },
  { code: 'KW', nom: 'Koweït' },
  { code: 'RE', nom: 'La Réunion' },
  { code: 'LA', nom: 'Laos' },
  { code: 'LS', nom: 'Lesotho' },
  { code: 'LV', nom: 'Lettonie' },
  { code: 'LB', nom: 'Liban' },
  { code: 'LR', nom: 'Liberia' },
  { code: 'LY', nom: 'Libye' },
  { code: 'LI', nom: 'Liechtenstein' },
  { code: 'LT', nom: 'Lituanie' },
  { code: 'LU', nom: 'Luxembourg' },
  { code: 'MK', nom: 'Macédoine du Nord' },
  { code: 'MG', nom: 'Madagascar' },
  { code: 'MY', nom: 'Malaisie' },
  { code: 'MW', nom: 'Malawi' },
  { code: 'MV', nom: 'Maldives' },
  { code: 'ML', nom: 'Mali' },
  { code: 'MT', nom: 'Malte' },
  { code: 'MA', nom: 'Maroc' },
  { code: 'MQ', nom: 'Martinique' },
  { code: 'MU', nom: 'Maurice' },
  { code: 'MR', nom: 'Mauritanie' },
  { code: 'YT', nom: 'Mayotte' },
  { code: 'MX', nom: 'Mexique' },
  { code: 'FM', nom: 'Micronésie' },
  { code: 'MD', nom: 'Moldavie' },
  { code: 'MC', nom: 'Monaco' },
  { code: 'MN', nom: 'Mongolie' },
  { code: 'ME', nom: 'Monténégro' },
  { code: 'MS', nom: 'Montserrat' },
  { code: 'MZ', nom: 'Mozambique' },
  { code: 'MM', nom: 'Myanmar (Birmanie)' },
  { code: 'NA', nom: 'Namibie' },
  { code: 'NR', nom: 'Nauru' },
  { code: 'NP', nom: 'Népal' },
  { code: 'NI', nom: 'Nicaragua' },
  { code: 'NE', nom: 'Niger' },
  { code: 'NG', nom: 'Nigeria' },
  { code: 'NU', nom: 'Niue' },
  { code: 'NO', nom: 'Norvège' },
  { code: 'NC', nom: 'Nouvelle-Calédonie' },
  { code: 'NZ', nom: 'Nouvelle-Zélande' },
  { code: 'OM', nom: 'Oman' },
  { code: 'UG', nom: 'Ouganda' },
  { code: 'UZ', nom: 'Ouzbékistan' },
  { code: 'PK', nom: 'Pakistan' },
  { code: 'PW', nom: 'Palaos' },
  { code: 'PA', nom: 'Panama' },
  { code: 'PG', nom: 'Papouasie-Nouvelle-Guinée' },
  { code: 'PY', nom: 'Paraguay' },
  { code: 'NL', nom: 'Pays-Bas' },
  { code: 'BQ', nom: 'Pays-Bas caribéens' },
  { code: 'PE', nom: 'Pérou' },
  { code: 'PH', nom: 'Philippines' },
  { code: 'PL', nom: 'Pologne' },
  { code: 'PF', nom: 'Polynésie française' },
  { code: 'PR', nom: 'Porto Rico' },
  { code: 'PT', nom: 'Portugal' },
  { code: 'QA', nom: 'Qatar' },
  { code: 'HK', nom: 'R.A.S. chinoise de Hong Kong' },
  { code: 'MO', nom: 'R.A.S. chinoise de Macao' },
  { code: 'CF', nom: 'République centrafricaine' },
  { code: 'DO', nom: 'République dominicaine' },
  { code: 'RO', nom: 'Roumanie' },
  { code: 'GB', nom: 'Royaume-Uni' },
  { code: 'RU', nom: 'Russie' },
  { code: 'RW', nom: 'Rwanda' },
  { code: 'EH', nom: 'Sahara occidental' },
  { code: 'BL', nom: 'Saint-Barthélemy' },
  { code: 'KN', nom: 'Saint-Christophe-et-Niévès' },
  { code: 'SM', nom: 'Saint-Marin' },
  { code: 'MF', nom: 'Saint-Martin' },
  { code: 'SX', nom: 'Saint-Martin (partie néerlandaise)' },
  { code: 'PM', nom: 'Saint-Pierre-et-Miquelon' },
  { code: 'VC', nom: 'Saint-Vincent-et-les Grenadines' },
  { code: 'SH', nom: 'Sainte-Hélène' },
  { code: 'LC', nom: 'Sainte-Lucie' },
  { code: 'SV', nom: 'Salvador' },
  { code: 'WS', nom: 'Samoa' },
  { code: 'AS', nom: 'Samoa américaines' },
  { code: 'ST', nom: 'Sao Tomé-et-Principe' },
  { code: 'SN', nom: 'Sénégal' },
  { code: 'RS', nom: 'Serbie' },
  { code: 'SC', nom: 'Seychelles' },
  { code: 'SL', nom: 'Sierra Leone' },
  { code: 'SG', nom: 'Singapour' },
  { code: 'SK', nom: 'Slovaquie' },
  { code: 'SI', nom: 'Slovénie' },
  { code: 'SO', nom: 'Somalie' },
  { code: 'SD', nom: 'Soudan' },
  { code: 'SS', nom: 'Soudan du Sud' },
  { code: 'LK', nom: 'Sri Lanka' },
  { code: 'SE', nom: 'Suède' },
  { code: 'CH', nom: 'Suisse' },
  { code: 'SR', nom: 'Suriname' },
  { code: 'SJ', nom: 'Svalbard et Jan Mayen' },
  { code: 'SY', nom: 'Syrie' },
  { code: 'TJ', nom: 'Tadjikistan' },
  { code: 'TW', nom: 'Taïwan' },
  { code: 'TZ', nom: 'Tanzanie' },
  { code: 'TD', nom: 'Tchad' },
  { code: 'CZ', nom: 'Tchéquie' },
  { code: 'PS', nom: 'Territoires palestiniens' },
  { code: 'TH', nom: 'Thaïlande' },
  { code: 'TL', nom: 'Timor oriental' },
  { code: 'TG', nom: 'Togo' },
  { code: 'TK', nom: 'Tokelau' },
  { code: 'TO', nom: 'Tonga' },
  { code: 'TT', nom: 'Trinité-et-Tobago' },
  { code: 'TN', nom: 'Tunisie' },
  { code: 'TM', nom: 'Turkménistan' },
  { code: 'TR', nom: 'Turquie' },
  { code: 'TV', nom: 'Tuvalu' },
  { code: 'UA', nom: 'Ukraine' },
  { code: 'UY', nom: 'Uruguay' },
  { code: 'VU', nom: 'Vanuatu' },
  { code: 'VE', nom: 'Venezuela' },
  { code: 'VN', nom: 'Viêt Nam' },
  { code: 'WF', nom: 'Wallis-et-Futuna' },
  { code: 'YE', nom: 'Yémen' },
  { code: 'ZM', nom: 'Zambie' },
  { code: 'ZW', nom: 'Zimbabwe' },
];

const NOM_PAYS = new Map(PAYS.map((pays) => [pays.code, pays.nom]));

/** Pays de la liste — l'Algérie et les codes inconnus n'en font pas partie. */
export function estPaysValide(code: string): boolean {
  return NOM_PAYS.has(code);
}

/**
 * Provenance lisible pour l'administration et le récapitulatif :
 * « Béjaïa (06) », « Étranger — France », « non renseignée ».
 *
 * Accepte undefined : un dossier antérieur à la question n'a jamais répondu,
 * et sa fiche doit s'afficher sans erreur.
 */
export function libelleProvenance(
  wilaya: string | null | undefined,
  pays: string | null | undefined,
): string {
  if (wilaya === null || wilaya === undefined || wilaya === '') {
    return 'non renseignée';
  }
  if (wilaya === WILAYA_ETRANGER) {
    return pays ? `Étranger — ${NOM_PAYS.get(pays) ?? pays}` : 'Étranger';
  }
  const nom = NOM_WILAYA.get(wilaya);
  return nom === undefined ? wilaya : `${nom} (${wilaya})`;
}
