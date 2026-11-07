'use client';

import { formatLocalDateTime, indexerAnnuaire, type CoureurAnnuaire } from '@azzel/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { assistancePhoneHref } from '@/components/assistance-button';
import { repliPoche, type ReplipocheResultat } from '@/lib/scan/repli-poche';
import type { FamilleScan } from '@/modules/missions/domain';

import { EcranMissionAmbigue } from './ecran-mission-ambigue';
import {
  lireAnnuaire,
  lireEtatVolontaires,
  obtenirAppareilId,
  passagesParJetonCheckpoint,
  retraitsParJeton,
} from '@/lib/idb-volontaires';
import { creerAudioScan, type AudioScan } from '@/lib/scan/audio-scan';
import {
  formatHeureVoyant,
  libelleVoyantPassage,
  libelleVoyantRetrait,
  traiterScanPassage,
  traiterScanRetrait,
  type ResultatPassage,
  type ResultatRetrait,
} from '@/lib/scan/etats-scan';
import {
  classifierErreurCamera,
  lancerDecodeur,
  type Decodeur,
} from '@/lib/scan/decodeur-qr';

// Ré-export (la note vit avec l'orchestrateur dans etats-scan, les tests de
// la page l'attendent depuis ce module).
export { NOTE_NON_ENREGISTRE } from '@/lib/scan/etats-scan';

// Story 4.2 — moteur de scan caméra et états de retour (UX-DR-6/7/18). Page
// 100 % locale : la validation se fait contre la réplique IndexedDB (jamais
// de réseau). Le bip + le voyant SONT la confirmation (< 1 s), aucun bouton
// « valider ». L'audio et la vibration ne partent qu'après le geste
// « Démarrer le scan ». Tutoiement (surface volontaire).
//
// Story 4.3 — le mode est un PARAMÈTRE (mêmes moteur, écrans, bips) :
// `retrait` (guichet) résout contre l'outbox IndexedDB — dédoublonnage
// PERSISTANT cross-session, append-only au succès, note « NON enregistré sur
// cet appareil » si IDB refuse (jamais de mensonge).
//
// Story 4.4 — le mode `checkpoint` (défaut) enregistre les PASSAGES sur le
// même gabarit : le checkpoint est la mission scan en cours (checkpointId
// transmis par la page), dédoublonnage persistant par PAIRE coureur ×
// checkpoint, libellé succès avec l'heure appareil intégrée.

/** Clignotement du voyant borné dans le temps : statique passé ce délai. */
export const DUREE_CLIGNOTEMENT_MS = 6000;

/** Famille de résolution par mode : le repli poche interroge la même que le serveur. */
const FAMILLE_PAR_MODE: Record<ModeScan, FamilleScan> = {
  checkpoint: 'chrono',
  retrait: 'retrait',
};

/** Marqueur de scanner sain : seul ce rendu devient le scanner hors-ligne du SW. */
export const MARQUEUR_SHELL_SCAN = 'scan';

/** Mode du scanner : paramètre unique, pas une page séparée. */
export type ModeScan = 'checkpoint' | 'retrait';

export interface TextesScan {
  surtitre: string;
  titrePreparation: string;
  annoncePreparation: string;
  titrePret: string;
  leadPret: (nombreCoureurs: number) => string;
  hintPret: string;
  ariaEcran: string;
}

/** Libellés dédiés par mode (mêmes écrans, textes distincts). */
export const TEXTES_SCAN: Record<ModeScan, TextesScan> = {
  checkpoint: {
    surtitre: 'Scan des e-dossards',
    titrePreparation: 'Préparation du scanner…',
    annoncePreparation: 'Lecture de l’annuaire enregistré sur cet appareil…',
    titrePret: 'Scanner les e-dossards',
    leadPret: (nombreCoureurs) =>
      `Annuaire prêt — ${nombreCoureurs} coureurs enregistrés sur cet appareil. Chaque passage s’enregistre sur l’appareil, même sans réseau.`,
    hintPret:
      'Vise le QR du coureur : le bip et le voyant confirment chaque passage en moins d’une seconde. Un coureur déjà passé à ce point de contrôle SUR CET APPAREIL (même après reconnexion) affiche DÉJÀ PASSÉ.',
    ariaEcran: 'Scanner les e-dossards',
  },
  retrait: {
    surtitre: 'Retrait des dossards',
    titrePreparation: 'Préparation du scanner…',
    annoncePreparation: 'Lecture de l’annuaire enregistré sur cet appareil…',
    titrePret: 'Retirer les dossards',
    leadPret: (nombreCoureurs) =>
      `Annuaire prêt — ${nombreCoureurs} coureurs enregistrés sur cet appareil. Le retrait fonctionne même sans réseau.`,
    hintPret:
      'Vise le QR du coureur au guichet : le bip et le voyant confirment le retrait en moins d’une seconde. Un coureur déjà retiré (même après reconnexion) affiche DÉJÀ PASSÉ.',
    ariaEcran: 'Retirer les dossards',
  },
};

type Phase =
  | 'chargement'
  | 'sans-annuaire'
  | 'prete'
  | 'active'
  | 'permission'
  | 'indisponible'
  | 'module'
  // Story 4.7 — repli poche : le serveur n'a pas pu résoudre l'affectation.
  | 'poche-absente'
  | 'poche-bloquee';

interface Voyant {
  resultat: ResultatRetrait | ResultatPassage;
  /** Heure de l'appareil du scan affiché (donnée locale, AD-3). */
  heure: Date;
  /** Succès enregistrable uniquement : IDB a refusé l'append (jamais de mensonge). */
  note?: string;
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
  mode = 'checkpoint',
}: {
  variante: 'permission' | 'indisponible';
  assistancePhone: string;
  onReessayer?: () => void;
  mode?: ModeScan;
}) {
  const refusee = variante === 'permission';
  const textes = TEXTES_SCAN[mode];
  return (
    <section className="scan-page-etat">
      <article className="socle-carte scan-cadre">
        <p className="surtitre">{textes.surtitre}</p>
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
            <button type="button" className="socle-action" onClick={onReessayer}>
              Réessayer
            </button>
          )}
          <a
            className="socle-action socle-action--contour"
            href={assistancePhoneHref(assistancePhone)}
          >
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
export function EcranAnnuaireAbsent({ mode = 'checkpoint' }: { mode?: ModeScan }) {
  return (
    <section className="scan-page-etat">
      <article className="socle-carte scan-cadre">
        <p className="surtitre">{TEXTES_SCAN[mode].surtitre}</p>
        <h1>Annuaire non chargé</h1>
        <p className="lead">
          L’annuaire des coureurs n’est pas encore sur cet appareil : impossible de valider un scan
          hors-ligne. Connecte-toi une fois en ligne, ouvre ta fiche mission, puis reviens ici.
        </p>
        <div className="scan-etat-actions">
          <Link className="socle-action" href="/volontaires">
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
  mode = 'checkpoint',
  checkpointId = null,
  depuisLaPoche = false,
}: {
  assistancePhone: string;
  /** Absent quand le serveur n'a pas pu résoudre : la poche fournit le titre. */
  missionLabel?: string;
  mode?: ModeScan;
  /**
   * Story 4.4 — id de la mission scan_checkpoint en cours (LE checkpoint) :
   * référence chaque passage (clé naturelle édition+coureur+checkpoint).
   * Null en mode retrait / hors mission.
   */
  checkpointId?: string | null;
  /**
   * Story 4.7 — la base n'a pas répondu : l'affectation est relue dans la
   * poche avec la MÊME résolution que le serveur. Jamais vrai quand le
   * serveur a tranché — deux réponses concurrentes n'ont pas lieu d'être.
   */
  depuisLaPoche?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('chargement');
  const [voyant, setVoyant] = useState<Voyant | null>(null);
  const [voyantClignote, setVoyantClignote] = useState(false);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [heureLive, setHeureLive] = useState<Date | null>(null);
  const [nombreCoureurs, setNombreCoureurs] = useState(0);
  // Story 4.7 — affectation reprise de la poche : mission et date de l'état
  // mémorisé (le bandeau de fraîcheur en dépend), plus le motif de blocage.
  const [repli, setRepli] = useState<ReplipocheResultat | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const decodeurRef = useRef<Decodeur | null>(null);
  const audioRef = useRef<AudioScan | null>(null);
  const indexRef = useRef<ReadonlyMap<string, CoureurAnnuaire> | null>(null);
  // Story 4.3 — mode retrait : index outbox (chargé au démarrage, mis à jour
  // par l'orchestrateur) + contexte d'append (appareil + édition) + numéro de
  // séquence (seul le DERNIER scan rend).
  const retraitsRef = useRef<Map<string, Date>>(new Map());
  // Story 4.4 — mode checkpoint : index outbox passages, clé composite
  // `${jeton}:${checkpointId}` (chargé au démarrage, mis à jour pareillement).
  const passagesRef = useRef<Map<string, Date>>(new Map());
  const appareilIdRef = useRef<string | null>(null);
  const editionIdRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);

  const textes = TEXTES_SCAN[mode];
  // Story 4.7 — le serveur d'abord, la poche seulement s'il s'est tu.
  const missionReprise = repli?.statut === 'resolue' ? repli : null;
  const checkpointEffectif = checkpointId ?? missionReprise?.mission.id ?? null;
  const libelleMission = missionLabel ?? missionReprise?.mission.titre ?? '';


  // (Revue) — l'écran actif vit dans UN booléen : les effets et leurs deps
  // lisent `actif`, jamais un booléen inline recomposé.
  const actif = phase === 'active';

  // Annuaire local : IndexedDB uniquement (jamais de réseau ici). Vide ou
  // absent → état bloquant, le scan refuse de démarrer à l'aveugle. Dans les
  // DEUX modes persistants, l'outbox (dédoublonnage cross-session) et
  // l'appareilId (clé d'idempotence) sont chargés en même temps : retraits
  // par jeton (4.3), passages par jeton×checkpoint (4.4).
  useEffect(() => {
    let annule = false;
    (async () => {
      // Story 4.7 — la poche d'abord : sans affectation, inutile de charger
      // l'annuaire, et scanner à l'aveugle est pire que ne pas scanner.
      if (depuisLaPoche) {
        const etat = await lireEtatVolontaires().catch(() => null);
        if (annule) {
          return;
        }
        const resultat = repliPoche(etat, FAMILLE_PAR_MODE[mode], new Date());
        setRepli(resultat);
        if (resultat.statut === 'absente') {
          setPhase('poche-absente');
          return;
        }
        if (resultat.statut === 'bloquee') {
          setPhase('poche-bloquee');
          return;
        }
      }
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
      const [appareilId, indexOutbox] = await Promise.all([
        obtenirAppareilId(),
        mode === 'retrait' ? retraitsParJeton() : passagesParJetonCheckpoint(),
      ]);
      if (annule) {
        return;
      }
      appareilIdRef.current = appareilId;
      editionIdRef.current = annuaire !== null ? annuaire.editionId : null;
      if (mode === 'retrait') {
        retraitsRef.current = indexOutbox;
      } else {
        passagesRef.current = indexOutbox;
      }
      setPhase('prete');
    })();
    return () => {
      annule = true;
    };
  }, [mode, depuisLaPoche]);

  // Un payload décodé → resolution + enregistrement → voyant + bip +
  // vibration (< 1 s). Les DEUX modes passent par leur orchestrateur pur :
  // émission immédiate (voyant+bip JAMAIS derrière l'outbox), append en
  // arrière-plan — une note « NON enregistré » ne complète le voyant QUE si
  // aucun scan plus récent n'a eu lieu entre temps (numéro de séquence :
  // seul le dernier scan rend).
  const surPayload = useCallback(
    (payload: string) => {
      const index = indexRef.current;
      if (index === null) {
        return;
      }
      const maintenant = new Date();
      const numero = sequenceRef.current + 1;
      sequenceRef.current = numero;

      if (mode === 'retrait') {
        const { retour, termine } = traiterScanRetrait(
          payload,
          index,
          retraitsRef.current,
          appareilIdRef.current,
          editionIdRef.current,
          maintenant,
        );
        setVoyant({ resultat: retour.resultat, note: retour.note, heure: maintenant });
        emettreRetourAudio(retour.resultat.etat);
        void termine.then((final) => {
          // Un scan antérieur résolu trop tard n'écrase jamais le voyant
          // récent ; sans note (append ok), rien à compléter.
          if (final.note !== undefined && numero === sequenceRef.current) {
            setVoyant((precedent) =>
              precedent === null ? precedent : { ...precedent, note: final.note },
            );
          }
        });
        return;
      }

      // Story 4.4 — mode checkpoint : passage persistant au checkpoint en
      // cours (mission scan), dédoublonnage par PAIRE coureur × checkpoint.
      const { retour, termine } = traiterScanPassage(
        payload,
        index,
        passagesRef.current,
        checkpointEffectif,
        appareilIdRef.current,
        editionIdRef.current,
        maintenant,
      );
      setVoyant({ resultat: retour.resultat, note: retour.note, heure: maintenant });
      emettreRetourAudio(retour.resultat.etat);
      void termine.then((final) => {
        if (final.note === undefined) {
          return;
        }
        // La note de refus atteint le voyant si ce scan est TOUJOURS le
        // dernier (garde habituelle), OU si le voyant courant est le doublon
        // OPTIMISTE de ce scan — un rescan affiché « DÉJÀ PASSÉ » pendant que
        // l'append échouait : la clé composite rattache la note au bon
        // coureur×checkpoint (sinon le doublon mentirait : rien n'est
        // enregistré).
        setVoyant((precedent) => {
          if (precedent === null) {
            return precedent;
          }
          const cleCourante =
            'cleComposite' in precedent.resultat ? precedent.resultat.cleComposite : undefined;
          const doublonDuRefus =
            precedent.resultat.etat === 'doublon' &&
            final.resultat.cleComposite !== undefined &&
            cleCourante === final.resultat.cleComposite;
          if (numero !== sequenceRef.current && !doublonDuRefus) {
            return precedent;
          }
          return { ...precedent, note: final.note };
        });
      });
    },
    [mode, checkpointEffectif],
  );

  const emettreRetourAudio = useCallback((etat: ResultatPassage['etat']) => {
    const audio = audioRef.current;
    if (audio === null) {
      return;
    }
    if (etat === 'succès') {
      audio.bipSucces();
    } else if (etat === 'doublon') {
      audio.bipDoublon();
    } else {
      audio.bipInconnu();
    }
    audio.vibrer(etat);
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
    // Dépendances sur le SCAN, pas sur l'objet : une note « NON enregistré »
    // arrivée tard remplace l'objet voyant et relançait le clignotement pour
    // six secondes de plus, alors que le scan, lui, n'a pas changé.
  }, [voyant?.resultat, voyant?.heure]);

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

  // Story 4.4 — le libellé succès du mode checkpoint intègre l'heure appareil
  // du scan : la fonction reçoit l'heure du voyant (donnée locale, AD-3).
  const libelleVoyant = (
    resultat: ResultatRetrait | ResultatPassage,
    heure: Date,
  ): string =>
    mode === 'retrait'
      ? libelleVoyantRetrait(resultat)
      : libelleVoyantPassage(resultat, heure);

  if (phase === 'chargement') {
    // Seul rendu émis par le serveur (état initial) : c'est donc lui qui porte
    // le marqueur dont le service worker fait sa condition de mise en cache.
    // Sans lui, la carte « Connexion indisponible » du scanner — rendue en 200
    // — deviendrait le scanner hors-ligne.
    return (
      <section className="scan-page-etat" data-az-shell={MARQUEUR_SHELL_SCAN}>
        <article className="socle-carte scan-cadre">
          <p className="surtitre">{textes.surtitre}</p>
          <h1>{textes.titrePreparation}</h1>
          <p className="hint" role="status">
            {textes.annoncePreparation}
          </p>
        </article>
      </section>
    );
  }

  if (phase === 'sans-annuaire') {
    return <EcranAnnuaireAbsent mode={mode} />;
  }

  // Story 4.7 — la base s'est tue ET la poche ne porte aucune affectation de
  // cette famille : on ne sait pas où rattacher un scan. L'impasse est
  // conservée, mais avec une porte de sortie.
  if (phase === 'poche-absente') {
    return (
      <section className="scan-page-etat">
        <article className="socle-carte scan-cadre">
          <p className="surtitre">{textes.surtitre}</p>
          <h1>Mission introuvable sur cet appareil</h1>
          <p className="lead" role="status">
            La connexion au serveur est interrompue et ta fiche mission n’est pas encore
            enregistrée ici. Ouvre ta fiche une fois en ligne, puis reviens.
          </p>
          <div className="scan-etat-actions">
            <a className="socle-action" href={assistancePhoneHref(assistancePhone)}>
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

  if (phase === 'poche-bloquee' && repli?.statut === 'bloquee') {
    return (
      <EcranMissionAmbigue
        raison={repli.raison}
        missions={repli.missions}
        assistancePhone={assistancePhone}
      />
    );
  }

  if (phase === 'permission' || phase === 'indisponible') {
    return (
      <EcranCameraRefusee
        variante={phase}
        assistancePhone={assistancePhone}
        onReessayer={demarrer}
        mode={mode}
      />
    );
  }

  if (phase === 'module') {
    return (
      <section className="scan-page-etat">
        <article className="socle-carte scan-cadre">
          <p className="surtitre">{textes.surtitre}</p>
          <h1>Lecteur QR indisponible</h1>
          <p className="lead">
            Le module de lecture des QR n’a pas pu être chargé sur cet appareil. Connecte-toi une
            fois en ligne, reviens sur cette page, puis réessaie.
          </p>
          <div className="scan-etat-actions">
            <a
              className="socle-action socle-action--contour"
              href={assistancePhoneHref(assistancePhone)}
            >
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
        <article className="socle-carte scan-cadre">
          <p className="surtitre">{textes.surtitre}</p>
          <h1>{textes.titrePret}</h1>
          <p className="lead">{textes.leadPret(nombreCoureurs)}</p>
          {missionReprise !== null && (
            <p className="scan-repli-poche" role="status">
              Serveur injoignable — checkpoint repris de ta fiche du{' '}
              <strong suppressHydrationWarning>
                {formatLocalDateTime(missionReprise.repriseDe)}
              </strong>
              . Si le PC t’a réaffecté depuis, appelle-le avant de scanner.
            </p>
          )}
          <p className="hint">{textes.hintPret}</p>
          <button type="button" className="socle-action scan-demarrer" onClick={demarrer}>
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
    <section className="scan-ecran" aria-label={textes.ariaEcran}>
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
            <span className="scan-badge scan-badge--mission">{libelleMission}</span>
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
            <p className="scan-voyant-texte">{libelleVoyant(voyant.resultat, voyant.heure)}</p>
            {voyant.note !== undefined && <p className="scan-voyant-note">{voyant.note}</p>}
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
              <p className="scan-voyant-texte">{libelleVoyant(voyant.resultat, voyant.heure)}</p>
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
