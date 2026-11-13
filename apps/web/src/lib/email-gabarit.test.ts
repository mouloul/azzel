import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildLoginCodeEmailHtml } from '@/modules/iam/email';
import {
  NOTIFICATION_TYPES,
  buildNotificationEmail,
  type NotificationPayload,
  type NotificationType,
} from '@/modules/notifications/email-contents';

import {
  LOGO_EMAIL_PATH,
  echapperHtml,
  rendreEmail,
  type ContenuEmail,
} from './email-gabarit';

const OPTIONS = {
  assistancePhone: '+213 555 010 200',
  espaceCoureurUrl: 'https://azzel.dz/espace-coureur',
  connexionUrl: 'https://azzel.dz/connexion',
  runnersAppUrl: 'https://coureurs.azzel.dz',
};

const PAYLOADS: Record<NotificationType, NotificationPayload> = {
  inscription_recue: { prenom: 'Yani', epreuve: 'La Longue — 35 km' },
  dossier_valide: { prenom: 'Yani', epreuve: 'La Longue — 35 km' },
  dossier_refuse: { prenom: 'Yani', epreuve: 'La Longue — 35 km', motif: 'Reçu illisible' },
  invitation_volontaire: { nom: 'Kahina' },
  rappel_j7: { prenom: 'Yani', dateCourse: '2027-03-26' },
  rappel_preuve: { coureurId: 'c1', prenom: 'Yani', limite: '2027-03-20T22:59:00.000Z' },
  inscription_expiree: { coureurId: 'c1', prenom: 'Yani', edition: 'Édition 2027' },
};

function contenu(overrides: Partial<ContenuEmail> = {}): ContenuEmail {
  return {
    objet: 'Objet',
    apercu: 'Aperçu',
    surtitre: 'Surtitre',
    titre: 'Titre',
    salutation: 'Salut Yani,',
    blocs: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('gabarit email — échappement', () => {
  it('une saisie ne peut pas injecter de balises dans le HTML', () => {
    const email = rendreEmail(
      contenu({
        salutation: 'Salut <script>alert(1)</script>,',
        blocs: [{ type: 'encart', libelle: 'Motif', texte: 'reçu "flou" & <b>gras</b>' }],
      }),
    );
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>gras</b>');
    expect(email.html).toContain('Salut &lt;script&gt;alert(1)&lt;/script&gt;,');
    expect(email.html).toContain('reçu &quot;flou&quot; &amp; &lt;b&gt;gras&lt;/b&gt;');
    // Le texte, lui, n'est pas interprété : il garde la saisie telle quelle.
    expect(email.text).toContain('Motif : reçu "flou" & <b>gras</b>');
  });

  it('échappe les cinq caractères significatifs', () => {
    expect(echapperHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('gabarit email — structure HTML', () => {
  it('logo servi par APP_URL, en PNG (le SVG ne s’affiche ni dans Gmail ni dans Outlook)', () => {
    vi.stubEnv('APP_URL', 'https://azzel.dz');
    const { html } = rendreEmail(contenu());
    expect(LOGO_EMAIL_PATH.endsWith('.png')).toBe(true);
    expect(html).toContain(`src="https://azzel.dz${LOGO_EMAIL_PATH}"`);
    expect(html).toContain('alt="Week-end Sportif Aït Aïssi"');
  });

  it('aperçu, titre et signature présents ; téléphone cliquable', () => {
    const { html, text } = rendreEmail(
      contenu({
        apercu: 'Il reste deux étapes',
        titre: 'Inscription bien reçue',
        blocs: [{ type: 'assistance', libelle: 'Appeler l’équipe', telephone: '+213 555 010 200' }],
      }),
    );
    expect(html).toContain('Il reste deux étapes');
    expect(html).toContain('Inscription bien reçue');
    expect(html).toContain('href="tel:+213555010200"');
    expect(html).toContain('L’équipe Azzel');
    expect(text.endsWith('À bientôt,\nL’équipe Azzel')).toBe(true);
    expect(text).toContain('Appeler l’équipe : +213 555 010 200');
  });

  it('espaces insécables à la française dans le HTML, pas dans le texte', () => {
    const { html, text } = rendreEmail(
      contenu({ blocs: [{ type: 'paragraphe', texte: 'Batterie à 100 % ? Épreuve « La Longue » : ok' }] }),
    );
    expect(html).toContain('Batterie à 100&nbsp;%&nbsp;? Épreuve «&nbsp;La Longue&nbsp;»&nbsp;: ok');
    expect(text).toContain('Batterie à 100 % ? Épreuve « La Longue » : ok');
  });

  it('étapes numérotées dans les deux rendus', () => {
    const { html, text } = rendreEmail(
      contenu({ blocs: [{ type: 'etapes', intro: 'À faire :', items: ['Un', 'Deux'] }] }),
    );
    expect(text).toContain('À faire :\n1. Un\n2. Deux');
    expect(html).toMatch(/>1<\/div>[\s\S]*>Un<\/td>[\s\S]*>2<\/div>[\s\S]*>Deux<\/td>/);
  });
});

describe('notifications — parité texte / HTML', () => {
  it.each(NOTIFICATION_TYPES)('%s : chaque lien du texte est aussi dans le HTML', (type) => {
    const email = buildNotificationEmail(type, PAYLOADS[type], OPTIONS);
    expect(email.html.startsWith('<!doctype html>')).toBe(true);
    expect(email.html).toContain(`<title>${echapperHtml(email.subject)}</title>`);
    const liens = email.text.match(/https?:\/\/\S+/g) ?? [];
    for (const lien of liens) {
      expect(email.html, lien).toContain(`href="${echapperHtml(lien)}"`);
    }
    expect(email.text).not.toContain('undefined');
    expect(email.html).not.toContain('undefined');
  });
});

describe('code de connexion — HTML', () => {
  it('affiche le code en grand et rappelle sa durée de validité', () => {
    const html = buildLoginCodeEmailHtml('654321');
    expect(html).toContain('>654321</td>');
    expect(html).toContain('valable 10 minutes');
    expect(html).toContain('<title>Ton code de connexion Azzel</title>');
  });
});
