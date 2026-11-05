import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Uppy, { type UppyFile } from '@uppy/core';
import XHRUpload from '@uppy/xhr-upload';
import { ArrowUpFromLine, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { z } from 'zod';
import { filesResponseSchema, type DropFile } from '../shared/files';
import { api, ApiError, message, okSchema } from './api';
import { FileRow, SavedFile } from './FileRow';

type UploadMeta = { uploadId: string };
type UploadBody = { id: string };
type LocalFile = UppyFile<UploadMeta, UploadBody>;

export default function Uploads({
  maxFileBytes,
  pendingFiles,
  onPendingReceived,
  onUnauthorized,
}: {
  maxFileBytes: number;
  pendingFiles: File[];
  onPendingReceived: () => void;
  onUnauthorized: () => void;
}) {
  const [files, setFiles] = useState<DropFile[]>([]);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [uppy] = useState(() =>
    new Uppy<UploadMeta, UploadBody>({
      autoProceed: true,
      restrictions: { maxFileSize: maxFileBytes, minFileSize: 1 },
    }).use(XHRUpload<UploadMeta, UploadBody>, {
      endpoint: '/api/files',
      formData: false,
      limit: 2,
      timeout: 120_000,
      shouldRetry: (xhr) => xhr.status === 0 || xhr.status >= 500,
      headers: (file) => ({
        'x-upload-id': file.meta.uploadId,
        'x-file-name': encodeURIComponent(file.name ?? 'untitled'),
        'x-file-size': String(file.size),
        'Content-Type': file.type || 'application/octet-stream',
      }),
      getResponseData: (xhr) => {
        const data: unknown = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) {
          const parsed = z.object({ error: z.string() }).safeParse(data);
          throw new Error(
            parsed.success ? parsed.data.error : 'Upload failed. Try again.',
          );
        }
        return z.object({ id: z.string() }).parse(data);
      },
    }),
  );

  const subscribe = useCallback(
    (callback: () => void) => {
      uppy.on('state-update', callback);
      return () => uppy.off('state-update', callback);
    },
    [uppy],
  );
  const snapshot = useCallback(() => uppy.getState(), [uppy]);
  const state = useSyncExternalStore(subscribe, snapshot);
  const localFiles = Object.values(state.files);

  const refresh = useCallback(
    () =>
      api('/files', filesResponseSchema)
        .then((result) => {
          setFiles(result.files);
          setLoaded(true);
          setConnectionError('');
          for (const local of uppy.getFiles()) {
            if (
              local.progress.uploadComplete &&
              result.files.some((file) => file.id === local.meta.uploadId)
            )
              uppy.removeFile(local.id);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401)
            onUnauthorized();
          else setConnectionError(message(error));
        }),
    [onUnauthorized, uppy],
  );

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 2000);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const onSuccess = () => {
      void refresh();
    };
    const onError = (
      file: LocalFile | undefined,
      uploadError: { message: string },
      response?: { status: number },
    ) => {
      if (response?.status === 401) onUnauthorized();
      if (!file) setError(uploadError.message);
    };
    const onRestriction = (_file: LocalFile | undefined, restriction: Error) =>
      setError(restriction.message);
    uppy.on('upload-success', onSuccess);
    uppy.on('upload-error', onError);
    uppy.on('restriction-failed', onRestriction);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      uppy.off('upload-success', onSuccess);
      uppy.off('upload-error', onError);
      uppy.off('restriction-failed', onRestriction);
    };
  }, [refresh, uppy, onUnauthorized]);

  useEffect(() => () => uppy.destroy(), [uppy]);

  const addFiles = useCallback(
    (selected: File[]) => {
      uppy.addFiles(
        selected.map((file) => ({
          name: file.name,
          type: file.type,
          data: file,
          meta: { uploadId: crypto.randomUUID() },
        })),
      );
    },
    [uppy],
  );

  useEffect(() => {
    if (!pendingFiles.length) return;
    addFiles(pendingFiles);
    onPendingReceived();
  }, [pendingFiles, onPendingReceived, addFiles]);

  async function remove(id: string) {
    try {
      await api(`/files/${id}`, okSchema, { method: 'DELETE' });
      await refresh();
    } catch (error) {
      setError(message(error));
    }
  }

  async function retry(id: string) {
    try {
      await api(`/files/${id}/retry`, okSchema, { method: 'POST' });
      await refresh();
    } catch (error) {
      setError(message(error));
    }
  }

  const visibleLocal = localFiles.filter(
    (local) => !files.some((file) => file.id === local.meta.uploadId),
  );

  return (
    <section className="uploads" aria-label="Uploads">
      <input
        className="visually-hidden"
        ref={input}
        type="file"
        multiple
        aria-label="Choose files"
        onChange={(event) => {
          setError('');
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <motion.button
        className="dropzone"
        whileTap={{ scale: 0.99 }}
        onClick={() => input.current?.click()}
      >
        <span className="dropzone-icon">
          <ArrowUpFromLine size={33} strokeWidth={1.4} />
        </span>
        <span>drop files here</span>
        <small>or click to browse</small>
      </motion.button>
      {(error || connectionError) && (
        <p className="workspace-error" role="alert">
          {error || connectionError}
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => {
              setError('');
              setConnectionError('');
            }}
          >
            <X size={16} />
          </button>
        </p>
      )}
      <ul className="file-list" aria-label="Files" aria-busy={!loaded}>
        <AnimatePresence initial={false}>
          {visibleLocal.map((file) => (
            <FileRow
              key={file.meta.uploadId}
              name={file.name ?? 'untitled'}
              size={file.size ?? 0}
              mime={file.type}
              detail={
                file.error
                  ? file.error
                  : file.progress.uploadComplete
                    ? 'saving'
                    : `uploading · ${file.progress.percentage ?? 0}%`
              }
              progress={
                file.error ? undefined : (file.progress.percentage ?? 0)
              }
              failed={Boolean(file.error)}
              actions={
                <>
                  {file.error && (
                    <button
                      className="icon-button"
                      aria-label={`Retry ${file.name}`}
                      onClick={() => {
                        void uppy.retryUpload(file.id);
                      }}
                    >
                      <RotateCcw size={17} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Cancel ${file.name}`}
                    onClick={() => uppy.removeFile(file.id)}
                  >
                    <X size={18} />
                  </button>
                </>
              }
            />
          ))}
          {files.map((file) => (
            <SavedFile
              key={file.id}
              file={file}
              remove={() => {
                void remove(file.id);
              }}
              retry={() => {
                void retry(file.id);
              }}
            />
          ))}
        </AnimatePresence>
      </ul>
      {!loaded && !error && (
        <div className="list-loading" aria-label="Loading files">
          <LoaderCircle size={18} className="spinning" />
        </div>
      )}
    </section>
  );
}
