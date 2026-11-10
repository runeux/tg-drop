import { Chat, type TelegramClient } from '@mtcute/node';
import type { ChatOption } from '../shared/settings.js';

export function telegramKey(peerId: number, messageId: number) {
  return `${peerId}:${messageId}`;
}

export function telegramLocation(key: string) {
  const [peer, message] = key.split(':');
  const peerId = Number(peer);
  const messageId = Number(message);
  if (
    !Number.isSafeInteger(peerId) ||
    !peerId ||
    !Number.isSafeInteger(messageId) ||
    messageId < 1
  ) {
    throw new Error('Invalid Telegram file location.');
  }
  return { peerId, messageId };
}

export async function listTelegramChats(
  client: Pick<TelegramClient, 'getMe' | 'iterDialogs'>,
): Promise<ChatOption[]> {
  const self = await client.getMe();
  const chats = new Map<number, ChatOption>();
  for await (const { peer } of client.iterDialogs({ archived: 'keep' })) {
    if (!(peer instanceof Chat) || peer.isLikelyUnavailable || !peer.isMember)
      continue;
    if (
      !peer.isCreator &&
      (!peer.isAdmin || (!peer.isGroup && !peer.adminRights?.postMessages))
    )
      continue;
    chats.set(peer.id, { id: peer.id, title: peer.displayName });
  }
  return [
    { id: self.id, title: 'saved messages' },
    ...[...chats.values()].sort((a, b) => a.title.localeCompare(b.title)),
  ];
}
