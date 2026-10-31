'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { fetchAvecDelai } from '@/lib/fetch-delai';
import {
  ACCOUNT_ROLES,
  CONNEXION_PATH,
  homePathForRole,
  type AccountRole,
} from '@/modules/iam/constants';

// La déconnexion purge IndexedDB et les caches PWA : son code n'a rien à faire
// dans le premier chargement de l'accueil (budget < 300 Kio). Chargée à la
// demande, seulement quand l'encart affiche l'état connecté.
const LogoutButton = lazy(() =>
  import('./logout-button').then((module) => ({ default: module.LogoutButton })),
);

export const ID_ENCART_MON_TRAIL = 'mon-trail-encart';
export const ID_TITRE_MON_TRAIL = 'mon-trail-titre';
export const LIEN_ME_CONNECTER = CONNEXION_PATH;
export const LIEN_M_INSCRIRE = `${CONNEXION_PATH}?parcours=inscription`;

const ESPACES_SANS_ONGLET = ['/admin', '/volontaires'] as const;

/** L'onglet vit partout, sauf dans les espaces organisateur et volontaire. */
export function ongletVisible(pathname: string | null): boolean {
  if (pathname === null) {
    return true;
  }
  return !ESPACES_SANS_ONGLET.some(
    (prefixe) => pathname === prefixe || pathname.startsWith(`${prefixe}/`),
  );
}

export type EtatSession = { connecte: false } | { connecte: true; espace: string };

export const SESSION_ANONYME: EtatSession = { connecte: false };

/** Réponse de /api/auth/session → état de l'encart. Tout ce qui est illisible est anonyme. */
export function etatDepuisSession(ok: boolean, payload: unknown): EtatSession {
  if (!ok) {
    return SESSION_ANONYME;
  }
  const role = (payload as { role?: unknown } | null)?.role;
  if (typeof role !== 'string' || !(ACCOUNT_ROLES as readonly string[]).includes(role)) {
    return SESSION_ANONYME;
  }
  return { connecte: true, espace: homePathForRole(role as AccountRole) };
}

/**
 * Session lue côté client, à l'ouverture de l'encart seulement : la lire dans
 * le layout rendrait toute l'application dynamique et ferait tomber le cache
 * (ISR) de l'accueil. Ne lève jamais : panne réseau ou délai → anonyme.
 */
export async function lireEtatSession(
  fetcher: typeof fetchAvecDelai = fetchAvecDelai,
): Promise<EtatSession> {
  try {
    const response = await fetcher('/api/auth/session', { method: 'GET' }, 10_000);
    if (!response.ok) {
      return SESSION_ANONYME;
    }
    return etatDepuisSession(true, await response.json());
  } catch {
    return SESSION_ANONYME;
  }
}

interface Contenant {
  contains(node: Node | null): boolean;
}

interface Focalisable {
  focus(): void;
}

/**
 * Encart tout juste ouvert : il reçoit le focus, puis se ferme sur Échap (le
 * focus revient à l'onglet) ou sur un clic extérieur (le focus suit le clic).
 * Écoute branchée sur `document` ; renvoie le débranchement.
 */
export function activerEncart({
  doc,
  panneau,
  onglet,
  fermer,
}: {
  doc: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  panneau: Contenant & Focalisable;
  onglet: Contenant & Focalisable;
  fermer: () => void;
}): () => void {
  panneau.focus();
  const surTouche = (event: Event) => {
    if ((event as KeyboardEvent).key === 'Escape') {
      event.preventDefault();
      fermer();
      onglet.focus();
    }
  };
  const surPointeur = (event: Event) => {
    const cible = event.target as Node | null;
    if (!panneau.contains(cible) && !onglet.contains(cible)) {
      fermer();
    }
  };
  doc.addEventListener('keydown', surTouche);
  doc.addEventListener('pointerdown', surPointeur);
  return () => {
    doc.removeEventListener('keydown', surTouche);
    doc.removeEventListener('pointerdown', surPointeur);
  };
}

/**
 * Corps de l'encart (sous le titre) : pur, rendu selon l'état de session.
 * Pendant la lecture de la session, aucun bouton d'action n'est proposé —
 * jamais un état précédent (périmé) cliquable.
 */
export function ContenuEncart({
  session,
  chargement,
  onNaviguer,
}: {
  session: EtatSession;
  chargement: boolean;
  onNaviguer?: () => void;
}) {
  if (chargement) {
    return <p className="mon-trail__texte">Chargement…</p>;
  }
  if (session.connecte) {
    return (
      <>
        <p className="mon-trail__texte">Votre session est ouverte sur cet appareil.</p>
        <div className="mon-trail__actions">
          <Link className="aa-btn aa-btn--primary" href={session.espace} onClick={onNaviguer}>
            Mon espace
          </Link>
          <Suspense fallback={null}>
            <LogoutButton libelle="Me déconnecter" className="aa-btn aa-btn--secondary" />
          </Suspense>
        </div>
      </>
    );
  }
  return (
    <>
      <p className="mon-trail__texte">
        Inscription, dossier et e-dossard : tout se passe dans votre espace.
      </p>
      <div className="mon-trail__actions">
        <Link className="aa-btn aa-btn--primary" href={LIEN_ME_CONNECTER} onClick={onNaviguer}>
          Me connecter
        </Link>
        <Link className="aa-btn aa-btn--secondary" href={LIEN_M_INSCRIRE} onClick={onNaviguer}>
          M’inscrire
        </Link>
      </div>
    </>
  );
}

/**
 * Onglet vertical « Mon trail », fixé au bord droit : ouvre un encart
 * « Me connecter » / « M'inscrire » (ou « Mon espace » / « Me déconnecter »
 * quand une session est lue). Les deux boutons mènent à la page de connexion
 * unique ; la destination finale est décidée par le serveur selon le rôle.
 */
export function MonTrail() {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const [session, setSession] = useState<EtatSession>(SESSION_ANONYME);
  const [chargement, setChargement] = useState(false);
  const ongletRef = useRef<HTMLButtonElement>(null);
  const panneauRef = useRef<HTMLElement>(null);

  // Fermeture par l'onglet ou par « Fermer » : le focus revient à l'onglet.
  const fermerVersOnglet = useCallback(() => {
    setOuvert(false);
    ongletRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!ouvert) {
      return;
    }
    const panneau = panneauRef.current;
    const onglet = ongletRef.current;
    if (!panneau || !onglet) {
      return;
    }
    return activerEncart({ doc: document, panneau, onglet, fermer: () => setOuvert(false) });
  }, [ouvert]);

  // Toute navigation (lien, déconnexion, retour navigateur) ferme l'encart :
  // l'état de session affiché ne survit jamais à un changement de page.
  useEffect(() => {
    setOuvert(false);
  }, [pathname]);

  useEffect(() => {
    if (!ouvert) {
      return;
    }
    let annule = false;
    setSession(SESSION_ANONYME);
    setChargement(true);
    void lireEtatSession().then((etat) => {
      if (!annule) {
        setSession(etat);
        setChargement(false);
      }
    });
    return () => {
      annule = true;
      setChargement(false);
    };
  }, [ouvert]);

  if (!ongletVisible(pathname)) {
    return null;
  }

  const fermerApresNavigation = () => setOuvert(false);

  return (
    <div className="mon-trail" data-ouvert={ouvert ? '' : undefined}>
      <button
        ref={ongletRef}
        type="button"
        className="mon-trail__onglet"
        aria-expanded={ouvert}
        aria-controls={ID_ENCART_MON_TRAIL}
        onClick={() => (ouvert ? fermerVersOnglet() : setOuvert(true))}
      >
        <span className="mon-trail__onglet-texte">Mon trail</span>
      </button>
      <section
        ref={panneauRef}
        id={ID_ENCART_MON_TRAIL}
        className="mon-trail__encart"
        aria-labelledby={ID_TITRE_MON_TRAIL}
        aria-busy={chargement ? true : undefined}
        tabIndex={-1}
        hidden={!ouvert}
      >
        <div className="mon-trail__entete">
          <h2 className="mon-trail__titre" id={ID_TITRE_MON_TRAIL}>
            Mon trail
          </h2>
          <button type="button" className="mon-trail__fermer" onClick={fermerVersOnglet}>
            Fermer
          </button>
        </div>
        <ContenuEncart
          session={session}
          chargement={chargement}
          onNaviguer={fermerApresNavigation}
        />
      </section>
    </div>
  );
}
