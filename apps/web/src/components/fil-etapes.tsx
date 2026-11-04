import type { ReactNode } from 'react';

/* Story 9.4 — fil d'étapes du dossier coureur.
 *
 * Contrat (UX-DR-21) : l'étape courante se lit PAR LA FORME (marqueur plein
 * à double filet) ET PAR LE TEXTE (« Étape N sur 4 — en cours »), jamais par
 * la couleur seule. Les étapes qui suivent ne portent AUCUNE mention d'état
 * et ne sont JAMAIS des liens : le fil ne prétend pas qu'elles sont
 * accessibles. Seules les étapes déjà franchies, et atteignables en retour,
 * reçoivent un href. Les états portés en texte sont exacts au sens de la
 * donnée connue de l'écran qui rend le fil : « Fait » / « À faire » /
 * « en cours » ; « suite » ne rend aucune mention (aucune donnée, aucune
 * promesse).
 */

export type EtatFilEtape = 'fait' | 'a-faire' | 'courante' | 'suite';

export interface EtapeFil {
  libelle: string;
  etat: EtatFilEtape;
  href?: string;
}

const TEXTE_ETAT: Partial<Record<EtatFilEtape, string>> = {
  fait: 'Fait',
  'a-faire': 'À faire',
};

export const LIBELLES_ETAPE = {
  inscription: 'Inscription',
  documents: 'Documents',
  paiement: 'Paiement',
  validation: 'Validation',
} as const;

function texteCourante(indexCourante: number, total: number): string {
  return `Étape ${indexCourante} sur ${total} — en cours`;
}

export function FilEtapes({ etapes }: { etapes: readonly EtapeFil[] }) {
  const indexCourante = etapes.findIndex((etape) => etape.etat === 'courante') + 1;
  return (
    <ol className="fil-etapes" aria-label="Étapes du dossier">
      {etapes.map((etape, index) => {
        const marqueur = etape.etat === 'fait' ? '✓' : String(index + 1);
        const texte =
          etape.etat === 'courante'
            ? texteCourante(indexCourante, etapes.length)
            : (TEXTE_ETAT[etape.etat] ?? null);
        const corps: ReactNode = (
          <>
            <span className="fil-etape-marqueur" aria-hidden="true">
              {marqueur}
            </span>
            <span className="fil-etape-textes">
              <span className="fil-etape-libelle">{etape.libelle}</span>
              {texte !== null && <span className="fil-etape-etat">{texte}</span>}
            </span>
          </>
        );
        return (
          <li
            key={etape.libelle}
            className={`fil-etape fil-etape--${etape.etat}`}
            aria-current={etape.etat === 'courante' ? 'step' : undefined}
          >
            {etape.href != null ? (
              <a className="fil-etape-lien" href={etape.href}>
                {corps}
              </a>
            ) : (
              <span className="fil-etape-corps">{corps}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* Builders purs : chaque écran ne marque QUE ce que son état prouve. */

function acceptationsCompletes(decharge: unknown, reglement: unknown): boolean {
  return decharge != null && reglement != null;
}

/** /inscription : étape 1 courante ; Documents marqué Fait seulement si le
 *  coureur existant a déjà les deux acceptations — franchie, l'étape devient
 *  retournable (matrice 9.4 : href '/acceptations', revue 9 M2) ; jamais de
 *  lien ni de promesse sur Paiement/Validation. */
export function etapesInscription(coureur: {
  dechargeAccepte: { acceptedAt: string; version: string } | null;
  reglementAccepte: { acceptedAt: string; version: string } | null;
} | null): EtapeFil[] {
  const documentsFaits = acceptationsCompletes(
    coureur?.dechargeAccepte,
    coureur?.reglementAccepte,
  );
  return [
    { libelle: LIBELLES_ETAPE.inscription, etat: 'courante' },
    {
      libelle: LIBELLES_ETAPE.documents,
      etat: documentsFaits ? 'fait' : 'suite',
      ...(documentsFaits ? { href: '/acceptations' } : {}),
    },
    { libelle: LIBELLES_ETAPE.paiement, etat: 'suite' },
    { libelle: LIBELLES_ETAPE.validation, etat: 'suite' },
  ];
}

/** /acceptations : étape 2 courante ; l'inscription est acquise (garde de la
 *  page : coureurStatus non null) donc Fait et retournable. */
export function etapesAcceptations(coureurStatus: string | null): EtapeFil[] {
  return [
    {
      libelle: LIBELLES_ETAPE.inscription,
      etat: coureurStatus !== null ? 'fait' : 'suite',
      ...(coureurStatus !== null ? { href: '/inscription' } : {}),
    },
    { libelle: LIBELLES_ETAPE.documents, etat: 'courante' },
    { libelle: LIBELLES_ETAPE.paiement, etat: 'suite' },
    { libelle: LIBELLES_ETAPE.validation, etat: 'suite' },
  ];
}

/** /preuve : étape 3 courante ; l'inscription est acquise (garde de la page).
 *  Documents est marqué honnêtement depuis documentsAcceptes (PreuveState),
 *  retournable dans les deux cas. */
export function etapesPreuve(
  coureurStatus: string | null,
  documentsAcceptesDossier: boolean,
): EtapeFil[] {
  return [
    {
      libelle: LIBELLES_ETAPE.inscription,
      etat: coureurStatus !== null ? 'fait' : 'suite',
      ...(coureurStatus !== null ? { href: '/inscription' } : {}),
    },
    {
      libelle: LIBELLES_ETAPE.documents,
      etat:
        coureurStatus === null
          ? 'suite'
          : documentsAcceptesDossier
            ? 'fait'
            : 'a-faire',
      ...(coureurStatus !== null ? { href: '/acceptations' } : {}),
    },
    { libelle: LIBELLES_ETAPE.paiement, etat: 'courante' },
    { libelle: LIBELLES_ETAPE.validation, etat: 'suite' },
  ];
}
