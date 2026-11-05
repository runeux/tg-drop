import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Uppy, { type UppyFile } from '@uppy/core';
import XHRUpload from '@uppy/xhr-upload';
import { ArrowUpFromLine, LoaderCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { z } from 'zod';
import { filesResponseSchema, type DropFile } from '../shared/files';
import { api, ApiError, message, okSchema } from './api';
import { SavedFile } from './FileRow';
import { validateFile } from './selection';

type UploadMeta = { uploadId: string; createdAt: number; order: number };
type UploadBody = { id: string };
type LocalFile = UppyFile<UploadMeta, UploadBody>;
type ListedFile = { file: DropFile; order: number; local?: LocalFile };

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
  const [files, setFiles] = useState<ListedFile[]>([]);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const active = useRef(false);
  const mutationVersion = useRef(0);
  const refreshRequest = useRef<AbortController | null>(null);
  const refreshFlight = useRef<Promise<void> | null>(null);
  const refreshQueued = useRef(false);
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
      onAfterResponse: async (xhr) => {
        if (xhr.status < 400) return;
        let data: unknown;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          throw new Error('Upload failed. Try again.');
        }
        const parsed = z.object({ error: z.string() }).safeParse(data);
        throw new Error(
          parsed.success ? parsed.data.error : 'Upload failed. Try again.',
        );
      },
      headers: (file) => ({
        'x-upload-id': file.meta.uploadId,
        'x-file-name': encodeURIComponent(file.name ?? 'untitled'),
        'x-file-size': String(file.size),
        'Content-Type': file.type || 'application/octet-stream',
      }),
      getResponseData: (xhr) => {
        const data: unknown = JSON.parse(xhr.responseText);
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

  const refresh = useCallback(() => {
    if (!active.current) return Promise.resolve();
    refreshQueued.current = true;
    if (refreshFlight.current) return refreshFlight.current;

    const load = async () => {
      do {
        refreshQueued.current = false;
        const controller = new AbortController();
        refreshRequest.current = controller;
        const version = mutationVersion.current;
        await api('/files', filesResponseSchema, { signal: controller.signal })
          .then((result) => {
            if (
              controller.signal.aborted ||
              version !== mutationVersion.current
            )
              return;
            const localOrder = new Map(
              uppy
                .getFiles()
                .map((file) => [file.meta.uploadId, file.meta.order]),
            );
            setFiles((previous) => {
              const previousOrder = new Map(
                previous.map(({ file, order }) => [file.id, order]),
              );
              return result.files.map((file) => ({
                file,
                order:
                  previousOrder.get(file.id) ??
                  localOrder.get(file.id) ??
                  file.createdAt * 1000,
              }));
            });
            setLoaded(true);
            setConnectionError('');
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted) return;
            if (error instanceof ApiError && error.status === 401)
              onUnauthorized();
            else setConnectionError(message(error));
          });
      } while (refreshQueued.current && active.current);
    };

    refreshFlight.current = load().finally(() => {
      refreshFlight.current = null;
      refreshRequest.current = null;
    });
    return refreshFlight.current;
  }, [onUnauthorized, uppy]);

  useEffect(() => {
    active.current = true;
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
      active.current = false;
      refreshQueued.current = false;
      refreshRequest.current?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      uppy.off('upload-success', onSuccess);
      uppy.off('upload-error', onError);
      uppy.off('restriction-failed', onRestriction);
    };
  }, [refresh, uppy, onUnauthorized]);

  useEffect(() => () => uppy.destroy(), [uppy]);

  useEffect(() => {
    for (const local of uppy.getFiles()) {
      if (
        local.progress.uploadComplete &&
        files.some(({ file }) => file.id === local.meta.uploadId)
      ) {
        uppy.removeFile(local.id);
      }
    }
  }, [files, uppy]);

  const addFiles = useCallback(
    (selected: File[]) =>
      Promise.all(
        selected.map(async (file) => {
          try {
            await validateFile(file, maxFileBytes);
            return { file };
          } catch (error) {
            return { error: `${file.name}: ${message(error)}` };
          }
        }),
      ).then((results) => {
        if (!active.current) return;
        const accepted = results.flatMap((result) =>
          result.file ? [result.file] : [],
        );
        const errors = results.flatMap((result) =>
          result.error ? [result.error] : [],
        );
        if (errors.length) setError(errors.join('\n'));
        uppy.addFiles(
          accepted.map((file) => ({
            name: file.name,
            type: file.type,
            data: file,
            meta: {
              uploadId: crypto.randomUUID(),
              createdAt: Date.now(),
              order: Date.now() * 1000 + sequence.current++,
            },
          })),
        );
      }),
    [uppy, maxFileBytes],
  );

  useEffect(() => {
    if (!pendingFiles.length) return;
    void addFiles(pendingFiles);
    onPendingReceived();
  }, [pendingFiles, onPendingReceived, addFiles]);

  async function remove(id: string) {
    setError('');
    try {
      await api(`/files/${id}`, okSchema, { method: 'DELETE' });
      mutationVersion.current++;
      setFiles((current) => current.filter(({ file }) => file.id !== id));
      await refresh();
    } catch (error) {
      setError(message(error));
    }
  }

  async function retry(id: string) {
    setError('');
    try {
      await api(`/files/${id}/retry`, okSchema, { method: 'POST' });
      mutationVersion.current++;
      setFiles((current) =>
        current.map((entry) =>
          entry.file.id === id
            ? {
                ...entry,
                file: { ...entry.file, status: 'queued', progress: 0 },
              }
            : entry,
        ),
      );
      await refresh();
    } catch (error) {
      setError(message(error));
    }
  }

  async function cancel(local: LocalFile) {
    setError('');
    uppy.removeFile(local.id);
    try {
      await api(`/files/${local.meta.uploadId}`, okSchema, {
        method: 'DELETE',
      });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        setError(message(error));
      }
    }
    mutationVersion.current++;
    setFiles((current) =>
      current.filter(({ file }) => file.id !== local.meta.uploadId),
    );
    await refresh();
  }

  async function retryLocal(local: LocalFile) {
    setError('');
    try {
      await uppy.retryUpload(local.id);
    } catch (error) {
      setError(message(error));
    }
  }

  const entries = new Map(files.map((entry) => [entry.file.id, entry]));
  for (const local of localFiles) {
    if (entries.has(local.meta.uploadId)) continue;
    entries.set(local.meta.uploadId, {
      order: local.meta.order,
      local,
      file: {
        id: local.meta.uploadId,
        name: local.name ?? 'untitled',
        size: local.size ?? 0,
        mime: local.type,
        code: '',
        createdAt: local.meta.createdAt,
        status: local.error
          ? 'failed'
          : local.progress.uploadStarted
            ? 'storing'
            : 'queued',
        progress: local.progress.percentage ?? 0,
      },
    });
  }
  const listedFiles = [...entries.values()].sort(
    (left, right) =>
      right.order - left.order || left.file.id.localeCompare(right.file.id),
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
          void addFiles(Array.from(event.target.files ?? []));
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
        <AnimatePresence initial={false} mode="popLayout">
          {listedFiles.map(({ file, local }) => (
            <SavedFile
              key={file.id}
              file={file}
              local={Boolean(local)}
              detail={
                local
                  ? local.error ||
                    (local.progress.uploadComplete
                      ? 'saving'
                      : `uploading · ${local.progress.percentage ?? 0}%`)
                  : undefined
              }
              remove={local ? () => cancel(local) : () => remove(file.id)}
              retry={local ? () => retryLocal(local) : () => retry(file.id)}
            />
          ))}
        </AnimatePresence>
      </ul>
      {!loaded && !error && !connectionError && (
        <div className="list-loading" aria-label="Loading files">
          <LoaderCircle size={18} className="spinning" />
        </div>
      )}
    </section>
  );
}
