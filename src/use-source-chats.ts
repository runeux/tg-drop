import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { chatOptionSchema, type ChatOption } from '../shared/settings';
import { api, ApiError, message } from './api';

const chatsSchema = z.object({ chats: z.array(chatOptionSchema) });

export type SourceChats = {
  chats: ChatOption[];
  refreshing: boolean;
  error: string;
  refresh: () => void;
};

export function useSourceChats(onUnauthorized: () => void): SourceChats {
  const [chats, setChats] = useState<ChatOption[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );

  const refresh = useCallback(() => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setError('');
    void api('/settings/chats', chatsSchema, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setChats(result.chats);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onUnauthorized();
        else setError(message(error));
      })
      .finally(() => {
        if (request.current !== controller) return;
        request.current = null;
        setRefreshing(false);
      });
  }, [onUnauthorized]);

  return { chats, refreshing, error, refresh };
}
