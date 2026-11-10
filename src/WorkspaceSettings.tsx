import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, LoaderCircle, RotateCw } from 'lucide-react';
import { z } from 'zod';
import {
  chatOptionSchema,
  workspaceSettingsSchema,
  type ChatOption,
  type SyncStatus,
  type WorkspaceSettings,
} from '../shared/settings';
import { api, ApiError, message } from './api';
import { HotkeyBadge } from './HotkeyBadge';
import { SourceFields, type SourceDraft } from './SourceFields';
import { TagFields } from './TagFields';
import './settings.css';

export function SyncIndicator() {
  return (
    <>
      <LoaderCircle size={14} className="spinning" aria-hidden="true" />
      re-syncing…
    </>
  );
}

export function SettingsDialog({
  close,
  children,
}: {
  close: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="settings-dialog"
      aria-label="Settings"
      ref={dialog}
      onClose={close}
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget)
          close();
      }}
    >
      <div className="settings-panel">
        <button
          type="button"
          className="settings-quiet settings-back"
          onClick={close}
        >
          <ChevronLeft size={15} aria-hidden="true" /> back{' '}
          <HotkeyBadge>Esc</HotkeyBadge>
        </button>
        {children}
      </div>
    </dialog>
  );
}

export function SettingsForm({
  settings,
  setup = false,
  sync,
  resync,
  saved,
  onUnauthorized,
}: {
  settings: WorkspaceSettings;
  setup?: boolean;
  sync?: SyncStatus;
  resync?: () => void;
  saved: (settings: WorkspaceSettings) => void;
  onUnauthorized: () => void;
}) {
  const hint = useId();
  const [sources, setSources] = useState<SourceDraft[]>(() =>
    settings.sources.length
      ? settings.sources.map(({ id, tagId }) => ({
          key: String(id),
          id,
          tagId,
        }))
      : [{ key: 'first', id: null, tagId: null }],
  );
  const [tags, setTags] = useState(settings.tags);
  const [chats, setChats] = useState<ChatOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chatError, setChatError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void api(
      '/settings/chats',
      z.object({ chats: z.array(chatOptionSchema) }),
      { signal: controller.signal },
    )
      .then(({ chats }) => {
        if (!controller.signal.aborted) setChats(chats);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onUnauthorized();
        else setChatError(message(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, onUnauthorized]);

  const options = new Map(
    settings.sources.map(({ id, title }) => [id, { id, title }]),
  );
  for (const chat of chats) options.set(chat.id, chat);
  const configured = sources.flatMap(({ id, tagId }) =>
    id === null ? [] : [{ id, tagId }],
  );
  const invalid = !configured.length
    ? setup
      ? 'choose at least one telegram source to continue'
      : 'keep at least one telegram source to save'
    : sources.length !== configured.length
      ? 'choose a chat for each source or remove the empty row'
      : tags.some(({ label }) => !label.trim())
        ? 'give each tag a name'
        : '';

  async function save() {
    if (invalid || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      saved(
        await api('/settings', workspaceSettingsSchema, {
          method: 'PUT',
          body: JSON.stringify({ sources: configured, tags }),
        }),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthorized();
      else setSaveError(message(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h1>{setup ? 'connect telegram' : 'settings'}</h1>
      {setup && <p>choose where to keep and find your files</p>}
      <section className="settings-section" aria-label="Sources">
        <h2>sources</h2>
        <SourceFields
          sources={sources}
          chats={[...options.values()]}
          tags={tags}
          change={setSources}
          busy={saving || loading}
        />
        {loading && (
          <p role="status">
            <LoaderCircle size={14} className="spinning" /> loading chats…
          </p>
        )}
        {chatError && (
          <p role="alert">
            {chatError}
            <button
              type="button"
              className="settings-quiet"
              onClick={() => {
                setChatError('');
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
            >
              retry
            </button>
          </p>
        )}
        <p>uploads go to the first source</p>
      </section>
      {!setup && (
        <>
          <section className="settings-section" aria-label="Tags">
            <h2>tags</h2>
            <TagFields
              tags={tags}
              change={setTags}
              busy={saving}
              remove={(id) => {
                setTags(tags.filter((tag) => tag.id !== id));
                setSources(
                  sources.map((source) =>
                    source.tagId === id ? { ...source, tagId: null } : source,
                  ),
                );
              }}
            />
          </section>
          <section className="settings-section" aria-label="Sync">
            <h2>sync</h2>
            <button
              type="button"
              className="settings-secondary"
              disabled={sync?.running || saving}
              aria-busy={sync?.running}
              onClick={resync}
            >
              {sync?.running ? (
                <SyncIndicator />
              ) : (
                <>
                  <RotateCw size={14} aria-hidden="true" /> re-sync with
                  telegram
                </>
              )}
            </button>
            {sync?.error && <p role="alert">{sync.error}</p>}
          </section>
        </>
      )}
      <footer className="settings-footer">
        <div>
          {invalid && <p id={hint}>{invalid}</p>}
          {saveError && <p role="alert">{saveError}</p>}
        </div>
        <button
          type="submit"
          className="upload-button"
          disabled={Boolean(invalid) || saving}
          aria-describedby={invalid ? hint : undefined}
        >
          {saving && (
            <LoaderCircle size={14} className="spinning" aria-hidden="true" />
          )}
          {saving ? 'saving…' : setup ? 'continue' : 'save'}
        </button>
      </footer>
    </form>
  );
}
