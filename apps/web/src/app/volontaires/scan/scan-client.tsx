'use client';

import { indexerAnnuaire, type CoureurAnnuaire } from '@azzel/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { assistancePhoneHref } from '@/components/assistance-button';
import { lireAnnuaire } from '@/lib/idb-volontaires';
import { creerAudioScan, type AudioScan } from '@/lib/scan/audio-scan';
import {
  formatHeureVoyant,
  libelleVoyantScan,
  resoudreEtEnregistrer,
  type ResultatScan,
} from '@/lib/scan/etats-scan';
import {
  classifierErreurCamera,
  lancerDecodeur,
  type Decodeur,
} from '@/lib/scan/decodeur-qr';

// Story 4.2 — moteur de scan caméra et états de retour (UX-DR-6/7/18). Page
// 100 % locale : la validation se fait contre la réplique IndexedDB (jamais
// de réseau), le dédoublonnage est de SESSION (en mémoire — 4.3/4.4 le
// remplaceront). Le bip + le voyant SONT la confirmation (< 1 s), aucun
// bouton « valider ». L'audio et la vibration ne partent qu'après le geste
// « Démarrer le scan ». Tutoiement (surface volontaire).

/** Clignotement du voyant borné dans le temps : statique passé ce délai. */
export const DUREE_CLIGNOTEMENT_MS = 6000;

type Phase =
  | 'chargement'
  | 'sans-annuaire'
  | 'prete'
  | 'active'
  | 'permission'
  | 'indisponible'
  | 'module';

interface Voyant {
  resultat: ResultatScan;
  /** Heure de l'appareil du scan affiché (donnée locale, AD-3). */
  heure: Date;
}

/** Chemins Réglages complets (UX-DR-18) — texte intégral, jamais la couleur seule. */
function CheminsReglages() {
  return (
    <ol className="scan-reglages">
      <li>
        <strong>iPhone (Safari)</strong> : Réglages → Safari → Caméra → « Autoriser ». Si tu as
        ajouté Azzel à l’écran d’accueil : Réglages → Azzel → Caméra → « Autoriser ».
      </li>
      <li>
        <strong>Android (Chrome)</strong> : appui long sur l’icône Azzel Volontaires → ⓘ
        Informations sur l’application → Autorisations → Caméra → « Autoriser ». Ou Réglages →
        Applications → Azzel Volontaires → Autorisations.
      </li>
    </ol>
  );
}

/**
 * Écran dédié caméra refusée/indisponible (UX-DR-18) : chemins Réglages iOS et
 * Android complets + bouton assistance PC. Pas de boucle de relance — le
 * bouton « Réessayer » est une action explicite du volontaire.
 */
export function EcranCameraRefusee({
  variante,
  assistancePhone,
  onReessayer,
}: {
  variante: 'permission' | 'indisponible';
  assistancePhone: string;
  onReessayer?: () => void;
}) {
  const refusee = variante === 'permission';
  return (
    <section className="scan-page-etat">
      <article className="card scan-cadre">
        <p className="surtitre">Scan des e-dossards</p>
        <h1>{refusee ? 'Autoriser la caméra' : 'Caméra indisponible'}</h1>
        {refusee ? (
          <>
            <p className="lead">
              Pour lire les e-dossards, Azzel doit utiliser la caméra arrière de ton téléphone.
              Elle est actuellement refusée.
            </p>
            <CheminsReglages />
            <p className="hint">
              Une fois la caméra autorisée dans les Réglages, reviens sur cette page et relance le
              scan.
            </p>
          </>
        ) : (
          <p className="lead">
            Aucune caméra utilisable n’a été trouvée sur cet appareil. Le scan des e-dossards
            nécessite un téléphone avec caméra.
          </p>
        )}
        <div className="scan-etat-actions">
          {onReessayer !== undefined && (
            <button type="button" className="btn-action" onClick={onReessayer}>
              Réessayer
            </button>
          )}
          <a className="btn-contour" href={assistancePhoneHref(assistancePhone)}>
            Appeler le PC
          </a>
          <Link className="btn-lien" href="/volontaires">
            Revenir à ma fiche
          </Link>
        </div>
      </article>
    </section>
  );
}

/** État bloquant : pas de scan à l'aveugle sans annuaire chargé (IndexedDB). */
export function EcranAnnuaireAbsent() {
  return (
    <section className="scan-page-etat">
      <article className="card scan-cadre">
        <p className="surtitre">Scan des e-dossards</p>
        <h1>Annuaire non chargé</h1>
        <p className="lead">
          L’annuaire des coureurs n’est pas encore sur cet appareil : impossible de valider un scan
          hors-ligne. Connecte-toi une fois en ligne, ouvre ta fiche mission, puis reviens ici.
        </p>
        <div className="scan-etat-actions">
          <Link className="btn-action" href="/volontaires">
            Revenir à ma fiche
          </Link>
        </div>
      </article>
    </section>
  );
}

export function ScanClient({
  assistancePhone,
  missionLabel,
}: {
  assistancePhone: string;
  missionLabel: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('chargement');
  const [voyant, setVoyant] = useState<Voyant | null>(null);
  const [voyantClignote, setVoyantClignote] = useState(false);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [heureLive, setHeureLive] = useState<Date | null>(null);
  const [nombreCoureurs, setNombreCoureurs] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const decodeurRef = useRef<Decodeur | null>(null);
  const audioRef = useRef<AudioScan | null>(null);
  const indexRef = useRef<ReadonlyMap<string, CoureurAnnuaire> | null>(null);
  // Dédoublonnage de SESSION (en mémoire) : jeton → première lecture. 4.3/4.4
  // le remplaceront par leurs clés naturelles persistées.
  const dejaVusRef = useRef<Map<string, Date>>(new Map());

  // (Revue) — l'écran actif vit dans UN booléen : les effets et leurs deps
  // lisent `actif`, jamais un booléen inline recomposé.
  const actif = phase === 'active';

  // Annuaire local : IndexedDB uniquement (jamais de réseau ici). Vide ou
  // absent → état bloquant, le scan refuse de démarrer à l'aveugle.
  useEffect(() => {
    let annule = false;
    (async () => {
      const annuaire = await lireAnnuaire();
      const index =
        annuaire !== null && annuaire.coureurs.length > 0 ? indexerAnnuaire(annuaire) : null;
      if (annule) {
        return;
      }
      if (index === null) {
        setPhase('sans-annuaire');
        return;
      }
      indexRef.current = index;
      setNombreCoureurs(index.size);
      setPhase('prete');
    })();
    return () => {
      annule = true;
    };
  }, []);

  // Un payload décodé → resolution + enregistrement de session → voyant +
  // bip + vibration (< 1 s).
  const surPayload = useCallback((payload: string) => {
    const index = indexRef.current;
    if (index === null) {
      return;
    }
    const maintenant = new Date();
    const resultat = resoudreEtEnregistrer(payload, index, dejaVusRef.current, maintenant);
    setVoyant({ resultat, heure: maintenant });
    const audio = audioRef.current;
    if (audio !== null) {
      if (resultat.etat === 'succès') {
        audio.bipSucces();
      } else if (resultat.etat === 'doublon') {
        audio.bipDoublon();
      } else {
        audio.bipInconnu();
      }
      audio.vibrer(resultat.etat);
    }
  }, []);

  // Démarrage/arrêt du décodeur suit l'écran actif : la caméra vit
  // exactement le temps du scan (libérée au stop, au démontage ET au signal
  // « décodeur muet » — échecs consécutifs ou caméra coupée en cours de scan).
  useEffect(() => {
    if (!actif) {
      return;
    }
    let annule = false;
    (async () => {
      try {
        const decodeur = await lancerDecodeur(videoRef.current!, surPayload, {
          surErreur: () => {
            if (!annule) {
              setPhase('indisponible');
            }
          },
        });
        if (annule) {
          decodeur.arreter();
          return;
        }
        decodeurRef.current = decodeur;
        setAnnonce('caméra active · annuaire chargé');
      } catch (erreur) {
        if (annule) {
          return;
        }
        const variante = classifierErreurCamera(erreur);
        setPhase(variante);
      }
    })();
    return () => {
      annule = true;
      decodeurRef.current?.arreter();
      decodeurRef.current = null;
    };
  }, [actif, surPayload]);

  // Horloge live du badge (heure locale, mono).
  useEffect(() => {
    if (!actif) {
      return;
    }
    setHeureLive(new Date());
    const horloge = setInterval(() => setHeureLive(new Date()), 1000);
    return () => clearInterval(horloge);
  }, [actif]);

  // Écran plein écran : le scroll du corps est verrouillé le temps du scan
  // (la fiche ne doit pas défiler dessous), restauré au nettoyage.
  useEffect(() => {
    if (!actif) {
      return;
    }
    const corps = document.body;
    const overflowAvant = corps.style.overflow;
    corps.style.overflow = 'hidden';
    return () => {
      corps.style.overflow = overflowAvant;
    };
  }, [actif]);

  // Clignotement borné (revue) : chaque nouveau voyant clignote ≤ 1 flash/s
  // pendant DUREE_CLIGNOTEMENT_MS puis reste affiché STATIQUE.
  useEffect(() => {
    if (voyant === null) {
      return;
    }
    setVoyantClignote(true);
    const fin = setTimeout(() => setVoyantClignote(false), DUREE_CLIGNOTEMENT_MS);
    return () => clearTimeout(fin);
  }, [voyant]);

  // Premier geste utilisateur : audio + vibration débloqués, caméra lancée.
  const demarrer = useCallback(() => {
    if (audioRef.current === null) {
      audioRef.current = creerAudioScan();
    }
    audioRef.current.debloquer();
    setVoyant(null);
    setAnnonce(null);
    setPhase('active');
  }, []);

  // Stop : caméra libérée immédiatement (tracks stoppés), retour à la fiche.
  const stopper = useCallback(() => {
    decodeurRef.current?.arreter();
    decodeurRef.current = null;
    router.push('/volontaires');
  }, [router]);

  if (phase === 'chargement') {
    return (
      <section className="scan-page-etat">
        <article className="card scan-cadre">
          <p className="surtitre">Scan des e-dossards</p>
          <h1>Préparation du scanner…</h1>
          <p className="hint" role="status">
            Lecture de l’annuaire enregistré sur cet appareil…
          </p>
        </article>
      </section>
    );
  }

  if (phase === 'sans-annuaire') {
    return <EcranAnnuaireAbsent />;
  }

  if (phase === 'permission' || phase === 'indisponible') {
    return (
      <EcranCameraRefusee
        variante={phase}
        assistancePhone={assistancePhone}
        onReessayer={demarrer}
      />
    );
  }

  if (phase === 'module') {
    return (
      <section className="scan-page-etat">
        <article className="card scan-cadre">
          <p className="surtitre">Scan des e-dossards</p>
          <h1>Lecteur QR indisponible</h1>
          <p className="lead">
            Le module de lecture des QR n’a pas pu être chargé sur cet appareil. Connecte-toi une
            fois en ligne, reviens sur cette page, puis réessaie.
          </p>
          <div className="scan-etat-actions">
            <a className="btn-contour" href={assistancePhoneHref(assistancePhone)}>
              Appeler le PC
            </a>
            <Link className="btn-lien" href="/volontaires">
              Revenir à ma fiche
            </Link>
          </div>
        </article>
      </section>
    );
  }

  if (phase === 'prete') {
    return (
      <section className="scan-page-etat">
        <article className="card scan-cadre">
          <p className="surtitre">Scan des e-dossards</p>
          <h1>Scanner les e-dossards</h1>
          <p className="lead">
            Annuaire prêt — {nombreCoureurs} coureurs enregistrés sur cet appareil. Le scan
            fonctionne même sans réseau.
          </p>
          <p className="hint">
            Vise le QR du coureur : le bip et le voyant confirment chaque lecture en moins d’une
            seconde. Aucun bouton à valider.
          </p>
          <button type="button" className="scan-demarrer" onClick={demarrer}>
            Démarrer le scan
          </button>
          <div className="scan-etat-actions">
            <Link className="btn-lien" href="/volontaires">
              Revenir à ma fiche
            </Link>
          </div>
        </article>
      </section>
    );
  }

  // --- Écran actif : caméra plein écran, voile quasi opaque, voyants.
  return (
    <section className="scan-ecran" aria-label="Scanner les e-dossards">
      <video
        ref={videoRef}
        className="scan-video"
        playsInline
        muted
        autoPlay
        aria-hidden="true"
      />
      <div className="scan-voile">
        <header className="scan-entete">
          <p className="scan-badges">
            <span className="scan-badge scan-badge--live">· LIVE</span>
            <span className="scan-badge scan-badge--heure" suppressHydrationWarning>
              {heureLive !== null ? formatHeureVoyant(heureLive) : '--:--:--'}
            </span>
            <span className="scan-badge scan-badge--mission">{missionLabel}</span>
          </p>
          <p role="status" className="scan-annonce" suppressHydrationWarning>
            {annonce ?? 'Caméra en cours de démarrage…'}
          </p>
        </header>

        {/* Voyant succès / doublon — position haute, pill plein cadre (UX-DR-7). */}
        {voyant !== null && voyant.resultat.etat !== 'inconnu' && (
          <div
            role="status"
            aria-live="assertive"
            className={`scan-voyant scan-voyant--${voyant.resultat.etat === 'succès' ? 'succes' : 'doublon'}${voyantClignote ? ' scan-voyant--vif' : ''}`}
          >
            <p className="scan-voyant-texte">{libelleVoyantScan(voyant.resultat)}</p>
            <p className="scan-voyant-heure" suppressHydrationWarning>
              {formatHeureVoyant(voyant.heure)}
            </p>
          </div>
        )}

        <div className="scan-bas">
          {/* Voyant inconnu — position basse : icône ⚠ ET position
              différencient le doublon (↻, en haut) de l'inconnu. */}
          {voyant !== null && voyant.resultat.etat === 'inconnu' && (
            <div
              role="status"
              aria-live="assertive"
              className={`scan-voyant scan-voyant--inconnu${voyantClignote ? ' scan-voyant--vif' : ''}`}
            >
              <p className="scan-voyant-texte">{libelleVoyantScan(voyant.resultat)}</p>
              <a className="scan-voyant-action" href={assistancePhoneHref(assistancePhone)}>
                Appeler le PC
              </a>
            </div>
          )}
          <button type="button" className="scan-stop" onClick={stopper}>
            Arrêter le scan
          </button>
        </div>
      </div>
    </section>
  );
}
