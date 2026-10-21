'use client';

import { formatLocalDateTime } from '@azzel/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { AssistanceButton } from '@/components/assistance-button';

import {
  ACCEPTED_PROOF_FORMATS_LABEL,
  MAX_PROOF_BYTES,
  PROOF_ACCEPT_ATTRIBUTE,
  detectProofFormat,
  fileExtension,
  formatKiloBytes,
  isAcceptedProofName,
} from '@/modules/inscriptions/proof-format';
import type { PreuveState, PreuveSummary } from '@/modules/inscriptions/proof-service';

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const TIMEOUT_ERROR = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessaie dans un instant.',
};

const COMPRESSION_SCALES = [1, 0.8, 0.65, 0.5, 0.4, 0.3];
const COMPRESSION_QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

interface PreuveDraft {
  file: File;
  previewUrl: string | null;
  originalSizeBytes: number;
  compressed: boolean;
}

async function readHeader(file: File): Promise<Uint8Array> {
  const header = file.slice(0, 16);
  return new Uint8Array(await header.arrayBuffer());
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

async function compressImage(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    for (const scale of COMPRESSION_SCALES) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      for (const quality of COMPRESSION_QUALITIES) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          return null;
        }
        context.drawImage(bitmap, 0, 0, width, height);
        const blob = await canvasToBlob(canvas, quality);
        if (blob && blob.size <= MAX_PROOF_BYTES) {
          return blob;
        }
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

export function PreuveForm({
  state,
  assistancePhone,
}: {
  state: PreuveState;
  assistancePhone: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<PreuveDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);
  const [deposited, setDeposited] = useState<PreuveSummary | null>(state.preuve);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current !== null) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  function setPreview(draft: PreuveDraft | null): void {
    if (previewRef.current !== null) {
      URL.revokeObjectURL(previewRef.current);
    }
    previewRef.current = draft?.previewUrl ?? null;
    setDraft(draft);
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setFieldError(null);
    if (!isAcceptedProofName(file.name)) {
      if (fileExtension(file.name) === 'heic' || fileExtension(file.name) === 'heif') {
        setFieldError(
          'Les photos iPhone au format HEIC ne sont pas acceptées. Ouvre Réglages > Appareil photo > Formats > « Le plus compatible », reprends la photo, puis renvoie-la.',
        );
      } else {
        setFieldError(
          `Ce format n’est pas accepté. Formats acceptés : ${ACCEPTED_PROOF_FORMATS_LABEL}.`,
        );
      }
      event.target.value = '';
      return;
    }
    let header: Uint8Array;
    try {
      header = await readHeader(file);
    } catch {
      setFieldError('Impossible de lire ce fichier. Réessaie, ou choisis une autre photo.');
      event.target.value = '';
      return;
    }
    const format = detectProofFormat(header);
    if (format === null) {
      setFieldError(
        `Ce fichier n’est pas une image ni un PDF (vérifié sur son contenu). Formats acceptés : ${ACCEPTED_PROOF_FORMATS_LABEL}.`,
      );
      event.target.value = '';
      return;
    }
    if (format === 'pdf') {
      if (file.size > MAX_PROOF_BYTES) {
        setFieldError(
          `Ce PDF pèse ${formatKiloBytes(file.size)} : ${formatKiloBytes(
            MAX_PROOF_BYTES,
          )} maximum. Un PDF ne se compresse pas ici — exporte une version allégée.`,
        );
        event.target.value = '';
        return;
      }
      setPreview({ file, previewUrl: null, originalSizeBytes: file.size, compressed: false });
      return;
    }
    if (file.size <= MAX_PROOF_BYTES) {
      setPreview({ file, previewUrl: URL.createObjectURL(file), originalSizeBytes: file.size, compressed: false });
      return;
    }
    setBusy(`Compression de ${formatKiloBytes(file.size)}…`);
    try {
      const blob = await compressImage(file);
      if (blob === null) {
        setFieldError(
          `Impossible de compresser cette image sous ${formatKiloBytes(
            MAX_PROOF_BYTES,
          )}. Reprends la photo de plus près, ou exporte un PDF.`,
        );
        event.target.value = '';
        return;
      }
      const compressed = new File([blob], 'preuve.jpg', { type: 'image/jpeg' });
      setPreview({
        file: compressed,
        previewUrl: URL.createObjectURL(blob),
        originalSizeBytes: file.size,
        compressed: true,
      });
    } catch {
      setFieldError(
        `Impossible de lire cette image. Formats acceptés : ${ACCEPTED_PROOF_FORMATS_LABEL}.`,
      );
      event.target.value = '';
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit(): Promise<void> {
    if (pending || draft === null) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setPending(true);
    try {
      const body = new FormData();
      body.append('fichier', draft.file, draft.file.name);
      const response = await fetch('/api/inscriptions/preuve', {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setReconnect(true);
        }
        if (response.status === 403 || response.status === 409) {
          router.refresh();
        }
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (typeof payload === 'object' && payload !== null && 'error' in payload) {
          const error = (payload as { error?: { message?: unknown; action?: unknown } }).error;
          if (typeof error?.message === 'string' && typeof error?.action === 'string') {
            setServerError({ message: error.message, action: error.action });
          } else {
            setServerError(NETWORK_ERROR);
          }
        } else {
          setServerError(NETWORK_ERROR);
        }
        return;
      }
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const candidate = (payload as { preuve?: unknown } | null)?.preuve;
      if (
        typeof candidate === 'object' &&
        candidate !== null &&
        typeof (candidate as PreuveSummary).id === 'string' &&
        typeof (candidate as PreuveSummary).depositedAt === 'string' &&
        typeof (candidate as PreuveSummary).sizeBytes === 'number' &&
        typeof (candidate as PreuveSummary).mime === 'string' &&
        typeof (candidate as PreuveSummary).format === 'string'
      ) {
        setDeposited(candidate as PreuveSummary);
        setPreview(null);
      } else {
        setServerError(NETWORK_ERROR);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        setServerError(TIMEOUT_ERROR);
      } else {
        setServerError(NETWORK_ERROR);
      }
    } finally {
      setPending(false);
    }
  }

  const edition = state.edition;

  return (
    <section className="auth auth-wide">
      <article className="card">
        <p className="surtitre">Preuve de paiement</p>
        <h1>{deposited !== null ? 'Remplacer ta preuve' : 'Dépose ta preuve de paiement CCP'}</h1>
        <p className="lead">
          Photographie ou capture de ton reçu de virement CCP : elle est compressée sur ton
          téléphone puis déposée ({formatKiloBytes(MAX_PROOF_BYTES)} maximum).
        </p>
        <p className="hint">
          Formats acceptés : {ACCEPTED_PROOF_FORMATS_LABEL}. Aucun autre format n’est accepté.
        </p>
        {deposited !== null && (
          <div className="recap" role="status" aria-live="polite">
            <p className="recap-titre">Preuve déposée</p>
            <p>
              Déposée le {formatLocalDateTime(deposited.depositedAt)} ·{' '}
              {formatKiloBytes(deposited.sizeBytes)} ({deposited.format})
            </p>
            <p className="meta">Tu peux la remplacer : l’ancienne reste conservée pour l’organisation.</p>
          </div>
        )}

        {draft !== null ? (
          <div className="recap" role="status" aria-live="polite">
            <p className="recap-titre">Prêt à envoyer</p>
            {draft.previewUrl !== null && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={draft.previewUrl}
                alt="Prévisualisation de ta preuve de paiement"
                className="preuve-apercu"
              />
            )}
            <p>
              {draft.compressed
                ? `Compressée sur ton téléphone : ${formatKiloBytes(
                    draft.originalSizeBytes,
                  )} → ${formatKiloBytes(draft.file.size)}`
                : `${formatKiloBytes(draft.file.size)} (déjà ${formatKiloBytes(
                    MAX_PROOF_BYTES,
                  )} ou moins : envoyé tel quel)`}
            </p>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="preuve-fichier">Ton reçu (photo ou PDF)</label>
            <input
              id="preuve-fichier"
              name="fichier"
              type="file"
              accept={PROOF_ACCEPT_ATTRIBUTE}
              onChange={onFileChange}
              disabled={busy !== null || pending}
              aria-invalid={fieldError !== null || undefined}
              aria-describedby={fieldError !== null ? 'preuve-erreur-format' : undefined}
            />
            {busy !== null && (
              <p className="hint" role="status" aria-live="polite">
                {busy}
              </p>
            )}
            {fieldError !== null && (
              <p id="preuve-erreur-format" className="field-error" role="alert">
                {fieldError}
              </p>
            )}
          </div>
        )}

        {draft !== null && (
          <div className="auth-alt">
            <button type="button" className="btn-action" onClick={onSubmit} disabled={pending}>
              {pending
                ? 'Envoi…'
                : serverError !== null
                  ? 'Réessayer'
                  : deposited !== null
                    ? 'Remplacer ma preuve'
                    : 'Envoyer ma preuve'}
            </button>
            <button
              type="button"
              className="btn-contour"
              onClick={() => {
                setPreview(null);
                setServerError(null);
                setFieldError(null);
              }}
              disabled={pending}
            >
              Choisir un autre fichier
            </button>
          </div>
        )}

        {serverError !== null && (
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{serverError.message}</p>
            <p className="error-action">
              {serverError.action}
              {reconnect && (
                <>
                  {' '}
                  <a className="btn-lien" href="/connexion">
                    Se reconnecter
                  </a>
                </>
              )}
            </p>
            <div className="auth-alt">
              <AssistanceButton phone={assistancePhone} />
            </div>
          </div>
        )}

        {edition !== null && (
          <p className="meta">
            Clôture des inscriptions : {formatLocalDateTime(edition.registrationClosesAt)}
          </p>
        )}
        <div className="auth-alt">
          <a className="btn-lien" href="/espace-coureur">
            Retour à mon espace
          </a>
        </div>
      </article>
    </section>
  );
}
