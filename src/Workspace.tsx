import { useEffect, useState, type ComponentProps } from 'react';
import { LoaderCircle } from 'lucide-react';
import {
  workspaceSettingsSchema,
  type WorkspaceSettings,
} from '../shared/settings';
import { api, ApiError, message } from './api';
import Uploads from './Uploads';
import { SettingsForm } from './WorkspaceSettings';

export default function Workspace(
  props: Omit<ComponentProps<typeof Uploads>, 'settings' | 'settingsSaved'>,
) {
  const { onUnauthorized } = props;
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void api('/settings', workspaceSettingsSchema, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setSettings(value);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onUnauthorized();
        else setError(message(error));
      });
    return () => controller.abort();
  }, [attempt, onUnauthorized]);

  if (!settings)
    return error ? (
      <div className="workspace-error" role="alert">
        {error}
        <button
          type="button"
          className="settings-quiet"
          onClick={() => {
            setError('');
            setAttempt((value) => value + 1);
          }}
        >
          retry
        </button>
      </div>
    ) : (
      <div className="list-loading" aria-label="Loading workspace">
        <LoaderCircle size={18} className="spinning" />
      </div>
    );

  if (settings.telegram && !settings.sources.length)
    return (
      <div className="settings-setup">
        <SettingsForm
          settings={settings}
          setup
          saved={setSettings}
          onUnauthorized={onUnauthorized}
        />
      </div>
    );

  return <Uploads {...props} settings={settings} settingsSaved={setSettings} />;
}
