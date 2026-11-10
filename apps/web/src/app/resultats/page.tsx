import type { Metadata } from 'next';
import Link from 'next/link';

import { Crete, Frise } from '@/components/frise';
import { assistancePhoneHref } from '@/components/assistance-button';
import { DEFAULT_ASSISTANCE_PHONE, readAssistancePhone } from '@/lib/assistance-phone';
import { lectureBorneeOuIndisponible } from '@/lib/lecture-bornee';
import { compterVisitePartage, getResultatsPublic } from '@/modules/chrono/service';

import { CarteCourse } from './carte-course';
import { ResultatsLive } from './resultats-live';

import './resultats.css';

// Story 7.2 — page publique /resultats (FR-16, SM-5, AD-7) : SSR COMPLET à
// chaque requête (lisible < 5 s sur 3G lent — le client n'est qu'un
// rafraîchisseur), organisation par défaut, AUCUNE session. Anonymat strict :
// la page ne rend que des dossards qualifiés par épreuve/édition — jamais nom,
// contact ni photo. Comptage : chaque chargement de l'URL PARTAGEABLE
// documentée (?partage=1, valeur exacte) incrémente l'agrégat anonyme du jour
// (best effort, en parallèle — un échec n'affecte JAMAIS le rendu) ; le
// polling ne compte jamais.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Résultats',
  description:
    'Classement provisoire par épreuve et derniers arrivés du Week-end Sportif Aït Aïssi, mis à jour au fil de la course.',
  // SEO sobre : la page n'expose que des numéros de dossard — jamais indexée.
  robots: { index: false },
  // Aperçus de partage (URL ?partage=1 collée partout le jour J).
  openGraph: {
    title: 'Résultats — Week-end Sportif Aït Aïssi',
    description:
      'Classement provisoire par épreuve et derniers arrivés, mis à jour au fil de la course.',
  },
};

export default async function ResultatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // Lecture publique, comptage (URL documentée ?partage=1 UNIQUEMENT) et
  // assistance en PARALLÈLE (allSettled) : le comptage best effort
  // n'ajoute JAMAIS de latence au premier octet, et un échec de l'une des
  // voix n'affecte jamais les autres — le rendu reste entier.
  // allSettled attendrait indéfiniment une promesse qui ne se règle jamais :
  // chaque lecture est bornée, un délai dépassé compte comme un échec.
  const [resultatsIssue, , telephoneIssue] = await Promise.allSettled([
    lectureBorneeOuIndisponible(getResultatsPublic(), 'résultats'),
    params.partage === '1'
      ? lectureBorneeOuIndisponible(compterVisitePartage(), 'comptage partage')
      : Promise.resolve(null),
    readAssistancePhone(),
  ]);
  const resultats = resultatsIssue.status === 'fulfilled' ? resultatsIssue.value : null;
  const telephone =
    telephoneIssue.status === 'fulfilled' ? telephoneIssue.value : DEFAULT_ASSISTANCE_PHONE;

  return (
    <>
      <Frise />
      <section className="vitrine-bande" aria-labelledby="titre-resultats">
        <div className="aa-section">
          <p className="aa-eyebrow">Jour de course</p>
          <h1 className="aa-h2" id="titre-resultats">
            Résultats en direct
          </h1>
          <Crete />
          <p className="aa-lead">
            Classement provisoire par épreuve et derniers arrivés, synchronisés au
            fil de la course. Seuls les numéros de dossard sont affichés.
          </p>

          {resultats === null ? (
            <div role="status" className="socle-carte resultats-indisponible">
              <p className="resultats-indisponible-message">
                Les résultats ne sont pas disponibles pour le moment.
              </p>
              <p className="resultats-indisponible-action">
                Réessayez dans un instant — cette page se rafraîchira d’elle-même.
                Besoin d’aide&nbsp;?{' '}
                <a href={assistancePhoneHref(telephone)}>Appelez l’équipe</a>.
              </p>
            </div>
          ) : null}

          {/* Le rafraîchisseur vit AUSSI sur la page dégradée : sans état
              initial, il affiche les squelettes puis remplit au premier
              polling réussi — jamais un écran d'échec figé. */}
          <ResultatsLive initial={resultats} />

          {/* Story 7.3 — carte publique anonyme, APRÈS les classements :
              FERMÉE par défaut, hors du chemin critique (aucun script/tuile
              avant le clic — le bouton seul vit dans le HTML initial). */}
          <CarteCourse />

          <p className="aa-liens-vitrine">
            <Link className="aa-lien-texte" href="/parcours">
              Parcours, horaires et consignes
            </Link>
            <Link className="aa-lien-texte" href="/">
              Revenir à l’accueil
            </Link>
          </p>
        </div>
      </section>
      <Frise />
    </>
  );
}
