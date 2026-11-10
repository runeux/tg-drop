import { test, expect } from '@playwright/test';
import {
  saveSettingsSchema,
  type Settings,
  type SyncStatus,
} from '../../shared/settings';

test('first sign-in, source settings, re-sync and filters work together', async ({
  page,
}) => {
  const chats = [
    { id: 123, title: 'saved messages' },
    { id: -1000000000042, title: 'market notes' },
    { id: -1000000000043, title: 'long-term research archive' },
  ];
  let settings: Settings = { sources: [], tags: [] };
  let sync: SyncStatus = { running: false, error: null };
  let resyncs = 0;
  let chatGate: Promise<void> | undefined;
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      const saved = saveSettingsSchema.parse(route.request().postDataJSON());
      settings = {
        tags: saved.tags,
        sources: saved.sources.map((source) => ({
          ...source,
          title: chats.find((chat) => chat.id === source.id)?.title ?? '',
        })),
      };
      sync = { running: true, error: null };
    }
    await route.fulfill({ json: { ...settings, telegram: true, sync } });
  });
  await page.route('**/api/settings/chats', async (route) => {
    await chatGate;
    return route.fulfill({ json: { chats } });
  });
  await page.route('**/api/settings/sync', (route) => {
    resyncs++;
    sync = { running: true, error: null };
    return route.fulfill({ status: 202, json: sync });
  });
  await page.route('**/api/files', (route) => {
    const tag = settings.tags.find(
      ({ id }) => id === settings.sources[0]?.tagId,
    );
    const files = ['notes.pdf', 'trades.zip', 'untagged.zip'].map(
      (name, index) => ({
        name,
        id: String(index),
        createdAt: 1000 * index,
        size: 10,
        mime: 'application/octet-stream',
        code: 'ABCD-EFGH-JKLM-NPQR',
        status: 'ready',
        progress: 0,
        tag: index < 2 ? tag : undefined,
      }),
    );
    return route.fulfill({ json: { files, sync } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'connect telegram' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'upload', exact: true }),
  ).toHaveCount(0);
  const continueButton = page.getByRole('button', {
    name: 'continue',
    exact: true,
  });
  await expect(continueButton).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Remove source 1' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Telegram source 1' }).click();
  await page.getByRole('menuitemradio', { name: 'market notes' }).click();
  await page.getByRole('button', { name: 'add another source' }).click();
  await page.getByRole('button', { name: 'Telegram source 2' }).click();
  await page.getByRole('menuitemradio', { name: 'saved messages' }).click();
  await continueButton.click();

  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  const header = page.locator('.upload-header');
  await expect(header.getByRole('status')).toHaveText('re-syncing…');
  sync = { running: false, error: null };
  await expect(header.getByRole('status')).toHaveCount(0);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(
    dialog.getByRole('heading', { name: 'settings', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Close settings' }),
  ).toHaveCSS('outline-style', 'none');
  await expect(dialog.locator('kbd')).toHaveCount(0);
  await expect(
    dialog.getByText(
      'find missed files and remove entries for files deleted in telegram.',
    ),
  ).toBeVisible();
  const resync = dialog.getByRole('button', { name: 're-sync with telegram' });
  await resync.click();
  await expect(
    dialog.getByRole('button', { name: 're-syncing…' }),
  ).toBeDisabled();
  expect(resyncs).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(header.getByRole('status')).toBeVisible();
  sync = { running: false, error: null };

  let releaseChats = () => {};
  chatGate = new Promise<void>((resolve) => {
    releaseChats = resolve;
  });
  await trigger.click();
  await expect(
    dialog.getByRole('status', { name: 'Refreshing chats' }),
  ).toBeVisible();
  const firstSource = dialog.getByRole('button', { name: 'Telegram source 1' });
  await expect(firstSource).toBeEnabled();
  await firstSource.focus();
  await page.keyboard.press('ArrowDown');
  await expect(
    dialog.getByRole('menuitemradio', { name: 'long-term research archive' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('menu')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(firstSource).toBeFocused();
  await firstSource.click();
  await dialog
    .getByRole('menuitemradio', { name: 'long-term research archive' })
    .click();
  await expect(firstSource).toHaveText('long-term research archive');
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBe(0);
  await dialog.getByRole('button', { name: 'Remove source 2' }).click();
  await expect(
    dialog.getByRole('button', { name: 'Remove source 1' }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'save', exact: true }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await expect(dialog).toHaveCount(0);

  await trigger.click();
  await dialog.getByRole('button', { name: 'add a tag' }).click();
  await dialog.getByLabel('Tag label 1').fill('crypto');
  await dialog.getByRole('button', { name: 'Color for crypto' }).click();
  await expect(
    dialog.getByRole('group', { name: 'Tag colors' }).getByRole('button'),
  ).toHaveCount(12);
  await dialog.getByRole('button', { name: 'amber', exact: true }).click();
  const tagPicker = dialog.getByRole('button', { name: 'Tag for source 1' });
  await tagPicker.click();
  const crypto = dialog.getByRole('menuitemradio', { name: 'crypto' });
  await expect(crypto.locator('.tag-badge')).toHaveText('crypto');
  await crypto.click();
  await expect(tagPicker.locator('.tag-badge')).toHaveText('crypto');
  await expect(
    dialog.getByRole('status', { name: 'Refreshing chats' }),
  ).toBeVisible();
  chatGate = undefined;
  releaseChats();
  await expect(
    dialog.getByRole('status', { name: 'Refreshing chats' }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(settings.tags[0]?.color).toBe('amber');
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);

  const list = page.getByRole('list', { name: 'Files', exact: true });
  const rows = list.getByRole('listitem');
  await expect(list.getByText('crypto', { exact: true })).toHaveCount(2);
  const headerBounds = await header.boundingBox();
  const listBounds = await list.boundingBox();
  const rowPadding = await rows
    .first()
    .evaluate((row) =>
      Number.parseFloat(getComputedStyle(row).paddingInlineStart),
    );
  expect(headerBounds).not.toBeNull();
  expect(listBounds?.x).toBeCloseTo((headerBounds?.x ?? 0) - rowPadding);
  expect(listBounds?.width).toBeCloseTo(
    (headerBounds?.width ?? 0) + rowPadding * 2,
  );

  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const menu = page.getByRole('menu');
  const tagFilter = menu.getByRole('menuitemcheckbox', { name: 'crypto' });
  const typeFilter = menu.getByRole('menuitemcheckbox', {
    name: 'zip',
    exact: true,
  });
  await tagFilter.click();
  await expect(rows).toHaveCount(2);
  await tagFilter.click();
  await expect(rows).toHaveCount(3);
  await expect(
    page.getByRole('button', { name: 'Clear tags filter' }),
  ).toHaveCount(0);
  await tagFilter.click();
  await typeFilter.click();
  await expect(rows).toHaveCount(1);
  await typeFilter.click();
  await expect(rows).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Clear file types filter' }),
  ).toHaveCount(0);
  await typeFilter.click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('trades.zip');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear tags filter' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await menu.getByRole('menuitem', { name: 'clear filters' }).click();
  await expect(rows).toHaveCount(3);
  await expect(
    page.getByRole('button', { name: 'Clear file types filter' }),
  ).toHaveCount(0);
});
