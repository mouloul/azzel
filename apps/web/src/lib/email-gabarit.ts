import { siteColorTokens, siteThemeLight } from '@azzel/shared';

import { readAppUrl } from './app-url';

/**
 * Gabarit commun des emails.
 *
 * Un email est décrit UNE fois, sous forme de blocs, puis rendu deux fois : en
 * texte (repli des clients qui n'affichent pas le HTML) et en HTML aux couleurs
 * de la vitrine. Écrire les deux versions à la main finirait par les faire
 * diverger : un lien corrigé d'un côté, oublié de l'autre.
 *
 * Contraintes propres à l'email, qui expliquent la forme du HTML :
 * - mise en page en tableaux et styles en ligne : Gmail retire une partie des
 *   feuilles de style, Outlook ignore flex, grid et max-width ;
 * - aucune image SVG (ni Gmail ni Outlook ne l'affichent) : le logo est un PNG
 *   servi par l'app, et son texte alternatif porte le nom si l'image est bloquée ;
 * - toute valeur venue d'une saisie (prénom, motif de refus, nom d'épreuve)
 *   est échappée : un prénom ne doit pas pouvoir injecter de balises.
 */

export const NOM_EVENEMENT = 'Week-end Sportif Aït Aïssi';

export const LIEU_EVENEMENT = 'Village d’Aït Aïssi, Yakouren';

export const SIGNATURE_EMAIL = 'L’équipe Azzel';

/** PNG 2× du logo négatif (crème sur forêt), affiché à 216 × 56. */
export const LOGO_EMAIL_PATH = '/charte/logos/aitaissi-logo-email.png';

export type TonEncart = 'neutre' | 'alerte' | 'succes';

export type BlocEmail =
  | { type: 'paragraphe'; texte: string }
  | { type: 'etapes'; intro: string; items: readonly string[] }
  | { type: 'encart'; texte: string; libelle?: string; ton?: TonEncart }
  | { type: 'bouton'; libelle: string; url: string }
  | { type: 'code'; code: string }
  | { type: 'assistance'; libelle: string; telephone: string };

export interface ContenuEmail {
  objet: string;
  /** Texte d'aperçu affiché par la boîte de réception à côté de l'objet. */
  apercu: string;
  surtitre: string;
  titre: string;
  salutation: string;
  blocs: readonly BlocEmail[];
}

export interface EmailRendu {
  subject: string;
  text: string;
  html: string;
}

const COULEURS = {
  fond: siteThemeLight.surface,
  carte: siteThemeLight['surface-raised'],
  bandeau: siteThemeLight['forest-surface'],
  lisere: siteColorTokens.ochre,
  encre: siteThemeLight.ink,
  encreDouce: siteThemeLight['ink-muted'],
  titre: siteThemeLight.heading,
  filet: siteThemeLight.line,
  action: siteThemeLight.action,
  surAction: siteThemeLight['on-action'],
  surForet: siteThemeLight['on-forest'],
  encartFond: siteColorTokens.cream,
  encartNeutre: siteColorTokens.sage,
  encartAlerte: siteColorTokens.ochre,
  encartSucces: siteColorTokens['forest-400'],
} as const;

const POLICE_TEXTE =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const POLICE_TITRE = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";

const POLICE_CODE = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace";

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

function blocEnTexte(bloc: BlocEmail): string {
  switch (bloc.type) {
    case 'paragraphe':
      return bloc.texte;
    case 'etapes':
      return [bloc.intro, ...bloc.items.map((item, index) => `${index + 1}. ${item}`)].join('\n');
    case 'encart':
      return bloc.libelle === undefined ? bloc.texte : `${bloc.libelle} : ${bloc.texte}`;
    case 'bouton':
      return `${bloc.libelle} :\n${bloc.url}`;
    case 'code':
      return bloc.code;
    case 'assistance':
      return `${bloc.libelle} : ${bloc.telephone}`;
  }
}

export function rendreEmailTexte(contenu: ContenuEmail): string {
  return [
    contenu.salutation,
    ...contenu.blocs.map(blocEnTexte),
    `À bientôt,\n${SIGNATURE_EMAIL}`,
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export function echapperHtml(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Texte d'un nœud HTML : échappé, puis espaces insécables de la typographie
 * française (avant « : ; ! ? % » », après « « »). Sans elles, un « 100 % » ou
 * un « ? » se retrouve seul en début de ligne sur un écran étroit.
 */
function texteHtml(valeur: string): string {
  return echapperHtml(valeur)
    .replace(/ ([:;!?%»])/g, '&nbsp;$1')
    .replace(/« /g, '«&nbsp;');
}

function lienTelephone(telephone: string): string {
  return `tel:${telephone.replace(/[^\d+]/g, '')}`;
}

const STYLE_PARAGRAPHE = 'margin:0 0 16px;';

function couleurEncart(ton: TonEncart): string {
  if (ton === 'alerte') {
    return COULEURS.encartAlerte;
  }
  if (ton === 'succes') {
    return COULEURS.encartSucces;
  }
  return COULEURS.encartNeutre;
}

function etapesEnHtml(intro: string, items: readonly string[]): string {
  const lignes = items
    .map(
      (item, index) => `<tr>
<td valign="top" width="36" style="padding:0 0 10px;">
<div style="width:26px;height:26px;line-height:26px;border-radius:13px;background-color:${COULEURS.bandeau};color:${COULEURS.surForet};font-size:13px;font-weight:700;text-align:center;">${index + 1}</div>
</td>
<td valign="top" style="padding:2px 0 10px;">${texteHtml(item)}</td>
</tr>`,
    )
    .join('\n');
  return `<p style="${STYLE_PARAGRAPHE}">${texteHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
${lignes}
</table>`;
}

function encartEnHtml(texte: string, libelle: string | undefined, ton: TonEncart): string {
  const titre =
    libelle === undefined
      ? ''
      : `<div style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${COULEURS.encreDouce};">${texteHtml(libelle)}</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
<tr><td bgcolor="${COULEURS.encartFond}" style="background-color:${COULEURS.encartFond};border-left:4px solid ${couleurEncart(ton)};border-radius:4px;padding:14px 16px;">
${titre}<div>${texteHtml(texte)}</div>
</td></tr>
</table>`;
}

function boutonEnHtml(libelle: string, url: string): string {
  const href = echapperHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;">
<tr><td bgcolor="${COULEURS.action}" style="background-color:${COULEURS.action};border-radius:6px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${POLICE_TEXTE};font-size:16px;font-weight:700;letter-spacing:0.04em;line-height:1.2;color:${COULEURS.surAction};text-decoration:none;border-radius:6px;">${texteHtml(libelle)}</a>
</td></tr>
</table>
<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:${COULEURS.encreDouce};">Le bouton ne s’ouvre pas&nbsp;? Copie ce lien&nbsp;: <a href="${href}" target="_blank" style="color:${COULEURS.action};word-break:break-all;">${href}</a></p>`;
}

function codeEnHtml(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
<tr><td align="center" bgcolor="${COULEURS.encartFond}" style="background-color:${COULEURS.encartFond};border:1px solid ${COULEURS.filet};border-radius:6px;padding:20px 12px;font-family:${POLICE_CODE};font-size:34px;font-weight:700;letter-spacing:0.3em;text-indent:0.3em;color:${COULEURS.titre};">${echapperHtml(code)}</td></tr>
</table>`;
}

function assistanceEnHtml(libelle: string, telephone: string): string {
  return `<p style="margin:8px 0 16px;padding:12px 0 0;border-top:1px solid ${COULEURS.filet};font-size:15px;color:${COULEURS.encreDouce};">${texteHtml(libelle)}&nbsp;: <a href="${echapperHtml(lienTelephone(telephone))}" style="color:${COULEURS.action};font-weight:700;text-decoration:none;white-space:nowrap;">${echapperHtml(telephone)}</a></p>`;
}

function blocEnHtml(bloc: BlocEmail): string {
  switch (bloc.type) {
    case 'paragraphe':
      return `<p style="${STYLE_PARAGRAPHE}">${texteHtml(bloc.texte)}</p>`;
    case 'etapes':
      return etapesEnHtml(bloc.intro, bloc.items);
    case 'encart':
      return encartEnHtml(bloc.texte, bloc.libelle, bloc.ton ?? 'neutre');
    case 'bouton':
      return boutonEnHtml(bloc.libelle, bloc.url);
    case 'code':
      return codeEnHtml(bloc.code);
    case 'assistance':
      return assistanceEnHtml(bloc.libelle, bloc.telephone);
  }
}

export function rendreEmailHtml(contenu: ContenuEmail): string {
  const logoUrl = echapperHtml(readAppUrl(LOGO_EMAIL_PATH));
  const policeBarlow = echapperHtml(
    readAppUrl('/charte/fonts/barlow-condensed-latin-700-normal.woff2'),
  );
  const corps = contenu.blocs.map(blocEnHtml).join('\n');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${echapperHtml(contenu.objet)}</title>
<style>
@font-face{font-family:'Barlow Condensed';font-weight:700;font-style:normal;src:url('${policeBarlow}') format('woff2')}
@media (max-width:600px){.az-carte{padding:28px 20px !important}.az-titre{font-size:28px !important}.az-bandeau{padding:20px !important}}
</style>
</head>
<body style="margin:0;padding:0;background-color:${COULEURS.fond};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${echapperHtml(contenu.apercu)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COULEURS.fond}" style="background-color:${COULEURS.fond};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td class="az-bandeau" bgcolor="${COULEURS.bandeau}" style="background-color:${COULEURS.bandeau};border-radius:8px 8px 0 0;padding:24px 32px;">
<img src="${logoUrl}" width="216" height="56" alt="${echapperHtml(NOM_EVENEMENT)}" style="display:block;width:216px;height:56px;border:0;outline:none;text-decoration:none;color:${COULEURS.surForet};font-family:${POLICE_TEXTE};font-size:18px;font-weight:700;">
</td></tr>
<tr><td height="4" bgcolor="${COULEURS.lisere}" style="height:4px;line-height:4px;font-size:0;background-color:${COULEURS.lisere};">&nbsp;</td></tr>
<tr><td class="az-carte" bgcolor="${COULEURS.carte}" style="background-color:${COULEURS.carte};border:1px solid ${COULEURS.filet};border-top:0;border-radius:0 0 8px 8px;padding:36px 32px 28px;font-family:${POLICE_TEXTE};font-size:16px;line-height:1.6;color:${COULEURS.encre};">
<p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${COULEURS.action};">${echapperHtml(contenu.surtitre)}</p>
<h1 class="az-titre" style="margin:0 0 24px;font-family:${POLICE_TITRE};font-size:34px;line-height:1.1;font-weight:700;text-transform:uppercase;color:${COULEURS.titre};">${texteHtml(contenu.titre)}</h1>
<p style="${STYLE_PARAGRAPHE}">${texteHtml(contenu.salutation)}</p>
${corps}
<p style="margin:24px 0 0;">À bientôt,<br><strong style="color:${COULEURS.titre};">${echapperHtml(SIGNATURE_EMAIL)}</strong></p>
</td></tr>
<tr><td align="center" style="padding:20px 16px 8px;font-family:${POLICE_TEXTE};font-size:12px;line-height:1.6;color:${COULEURS.encreDouce};">
${echapperHtml(NOM_EVENEMENT)} · ${echapperHtml(LIEU_EVENEMENT)}<br>Message automatique envoyé par Azzel.
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export function rendreEmail(contenu: ContenuEmail): EmailRendu {
  return {
    subject: contenu.objet,
    text: rendreEmailTexte(contenu),
    html: rendreEmailHtml(contenu),
  };
}
