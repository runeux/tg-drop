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
    { id: -1000000000043, title: 'archives' },
  ];
  let settings: Settings = { sources: [], tags: [] };
  let sync: SyncStatus = { running: false, error: null };
  let resyncs = 0;
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
  await page.route('**/api/settings/chats', (route) =>
    route.fulfill({ json: { chats } }),
  );
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
  await page
    .getByLabel('Telegram source 1')
    .selectOption({ label: 'market notes' });
  await page.getByRole('button', { name: 'add another source' }).click();
  await page
    .getByLabel('Telegram source 2')
    .selectOption({ label: 'saved messages' });
  await continueButton.click();

  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  const header = page.locator('.upload-header');
  await expect(header.getByRole('status')).toHaveText('re-syncing…');
  sync = { running: false, error: null };
  await expect(header.getByRole('status')).toHaveCount(0);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByText('Esc', { exact: true })).toBeVisible();
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

  await trigger.click();
  await dialog.getByRole('button', { name: 'Remove source 2' }).click();
  await dialog.getByRole('button', { name: 'Remove source 1' }).click();
  await expect(
    dialog.getByRole('button', { name: 'save', exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByText('keep at least one telegram source to save'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'back' }).click();

  await trigger.click();
  await dialog.getByRole('button', { name: 'add a tag' }).click();
  await dialog.getByLabel('Tag label 1').fill('crypto');
  await dialog.getByRole('button', { name: 'Color for crypto' }).click();
  await expect(
    dialog.getByRole('group', { name: 'Tag colors' }).getByRole('button'),
  ).toHaveCount(12);
  await dialog.getByRole('button', { name: 'amber', exact: true }).click();
  await dialog.getByLabel('Tag for source 1').selectOption({ label: 'crypto' });
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
  await menu.getByRole('menuitemcheckbox', { name: 'crypto' }).click();
  await expect(rows).toHaveCount(2);
  await menu
    .getByRole('menuitemcheckbox', { name: 'zip', exact: true })
    .click();
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
