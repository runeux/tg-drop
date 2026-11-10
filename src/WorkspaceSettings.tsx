import { useId, useState, type ReactNode, type RefObject } from 'react';
import { RiLoader4Line, RiRefreshLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldDescription, FieldGroup } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import {
  workspaceSettingsSchema,
  type SyncStatus,
  type WorkspaceSettings,
} from '../shared/settings';
import { api, ApiError, message } from './api';
import type { SourceChats } from './use-source-chats';
import { SourceFields, type SourceDraft } from './SourceFields';
import { TagFields } from './TagFields';
import './settings.css';

export function SyncIndicator() {
  return (
    <>
      <RiLoader4Line size={14} className="spinning" aria-hidden="true" />
      re-syncing…
    </>
  );
}

export function SettingsDialog({
  close,
  finalFocus,
  children,
}: {
  close: () => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  return (
    <Dialog
      defaultOpen
      onOpenChangeComplete={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="settings-dialog"
        closeLabel="Close settings"
        finalFocus={finalFocus}
      >
        <DialogHeader className="settings-header">
          <DialogTitle>settings</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function SettingsForm({
  settings,
  setup = false,
  sourceChats,
  sync,
  resync,
  saved,
  onUnauthorized,
}: {
  settings: WorkspaceSettings;
  setup?: boolean;
  sourceChats: SourceChats;
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const { chats, refreshing, error: chatError, refresh } = sourceChats;

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
      {setup && (
        <div className="settings-intro">
          <h1>connect telegram</h1>
          <p>choose where to keep and find your files</p>
        </div>
      )}
      <FieldGroup className="settings-sections">
        <section className="settings-section" aria-label="Sources">
          <h2 className="source-heading">
            sources
            {refreshing && (
              <span role="status" aria-label="Refreshing chats">
                <RiLoader4Line
                  size={12}
                  className="spinning"
                  aria-hidden="true"
                />
              </span>
            )}
          </h2>
          <SourceFields
            sources={sources}
            chats={[...options.values()]}
            tags={tags}
            change={setSources}
            busy={saving}
          />
          {chatError && (
            <p className="settings-retry" role="alert">
              {chatError}
              <Button
                variant="ghost"
                type="button"
                className="settings-quiet"
                onClick={refresh}
              >
                retry
              </Button>
            </p>
          )}
        </section>
        {!setup && (
          <>
            <Separator />
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
            <Separator />
            <section className="settings-section" aria-label="Sync">
              <div className="settings-section-intro">
                <h2>sync</h2>
                <FieldDescription>
                  find missed files and remove entries for files deleted in
                  telegram.
                </FieldDescription>
              </div>
              <Button
                variant="secondary"
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
                    <RiRefreshLine
                      data-icon="inline-start"
                      aria-hidden="true"
                    />{' '}
                    re-sync with telegram
                  </>
                )}
              </Button>
              {sync?.error && <p role="alert">{sync.error}</p>}
            </section>
          </>
        )}
      </FieldGroup>
      <Separator />
      <footer className="settings-footer">
        <div>
          {invalid && <p id={hint}>{invalid}</p>}
          {saveError && <p role="alert">{saveError}</p>}
        </div>
        <Button
          type="submit"
          size="lg"
          className="settings-save"
          disabled={Boolean(invalid) || saving}
          aria-describedby={invalid ? hint : undefined}
        >
          {saving && (
            <RiLoader4Line size={14} className="spinning" aria-hidden="true" />
          )}
          {saving ? 'saving…' : setup ? 'continue' : 'save'}
        </Button>
      </footer>
    </form>
  );
}
