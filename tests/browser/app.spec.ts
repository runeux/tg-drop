import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { downloadSchema, filesResponseSchema } from '../../shared/files';

test.beforeEach(async ({ context }, info) => {
  // each isolated browser context represents a different client for rate limiting.
  const network = createHash('sha256')
    .update(info.project.name + info.testId)
    .digest('hex');
  await context.setExtraHTTPHeaders({
    'X-Forwarded-For': `2001:db8:${network.slice(0, 4)}:${network.slice(4, 8)}::1`,
  });
});

test.afterEach(async ({ page }) => {
  const response = await page.request.get('/api/files');
  if (response.status() !== 200) return;
  const { files } = filesResponseSchema.parse(await response.json());
  for (const file of files) {
    const deletion = await page.request.delete(`/api/files/${file.id}`, {
      headers: { Origin: 'http://127.0.0.1:4173' },
    });
    expect(deletion.ok()).toBe(true);
  }
});

async function unlock(page: Page) {
  await page.getByLabel('Code or password').fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('button', { name: /drop files here/ }),
  ).toBeVisible();
}

async function dropFile(page: Page, name: string) {
  await page.evaluate((filename) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['file from whole-page drop'], filename, { type: 'text/plain' }),
    );
    window.dispatchEvent(
      new DragEvent('dragenter', { dataTransfer: transfer }),
    );
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer }));
  }, name);
}

test('password gate, automatic upload, copy code and repeatable manual downloads', async ({
  page,
  context,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByLabel('Code or password')).toBeVisible();
  await page.getByLabel('Code or password').fill('incorrect');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Code not found.');
  await page.getByLabel('Code or password').fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  const name = `notes-${test.info().project.name}.txt`;
  await page.getByLabel('Choose files').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from('hello from browser'),
  });
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row.getByRole('button', { name: /Copy code/ })).toBeVisible();
  const code = await row.locator('.code-value').innerText();
  expect(code.replaceAll('-', '')).toHaveLength(16);
  const nameDownload = page.waitForEvent('download');
  await row.getByRole('link', { name }).click();
  expect(await (await nameDownload).failure()).toBeNull();
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await row.getByRole('button', { name: /Copy code/ }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      code,
    );
  }
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel('Code or password').fill(code.toLowerCase());
  await expect(page.locator('.screen-entry')).toHaveCSS('transform', 'none');
  const submitBounds = await page
    .getByRole('button', { name: 'Continue' })
    .boundingBox();
  const formBounds = await page.locator('.entry-form').boundingBox();
  await page.getByRole('button', { name: 'Continue' }).click();
  const downloadButton = page.getByRole('link', { name: `Download ${name}` });
  await expect(downloadButton).toBeFocused();
  await expect(page.locator('.entry-form')).toHaveCSS('height', '66px');
  await expect(downloadButton).toHaveCSS('transform', 'none');
  expect(await downloadButton.boundingBox()).toEqual(submitBounds);
  expect((await page.locator('.entry-form').boundingBox())?.y).toBe(
    formBounds?.y,
  );
  await expect(page.getByRole('status')).toContainText(name);
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  const repeatPromise = page.waitForEvent('download');
  await downloadButton.click();
  const download = await repeatPromise;
  expect(download.suggestedFilename()).toBe(name);
  expect(await download.failure()).toBeNull();
  await page.getByRole('button', { name: 'back', exact: true }).click();
  await expect(page.getByLabel('Code or password')).toBeFocused();
  await expect(page.getByLabel('Code or password')).toHaveValue('');
  await unlock(page);
  await row.getByRole('button', { name: /^Delete / }).click();
  await row.getByRole('button', { name: /^Confirm delete / }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel('Code or password').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Code not found.');
  expect(errors).toEqual([]);
});

test('whole-page drop waits for password and files persist until manual removal', async ({
  page,
}) => {
  await page.goto('/');
  await dropFile(page, `pending-${test.info().project.name}.txt`);
  await expect(page.getByLabel('Code or password')).toBeVisible();
  await page.getByLabel('Code or password').fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  const pendingRow = page
    .getByRole('listitem')
    .filter({ hasText: `pending-${test.info().project.name}.txt` });
  await expect(
    pendingRow.getByRole('button', { name: /Copy code/ }),
  ).toBeVisible();
  await dropFile(page, `persistent-${test.info().project.name}.txt`);
  const persistentRow = page
    .getByRole('listitem')
    .filter({ hasText: `persistent-${test.info().project.name}.txt` });
  await expect(
    persistentRow.getByRole('button', { name: /Copy code/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await unlock(page);
  await expect(persistentRow).toBeVisible();
  await persistentRow.getByRole('button', { name: /^Delete / }).click();
  await persistentRow.getByRole('button', { name: /^Confirm delete / }).click();
  await expect(persistentRow).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('dashboard code edits replace the old code and share links wait for a click', async ({
  page,
  browser,
}) => {
  const origin = 'http://127.0.0.1:4173';
  await page.goto('/');
  await unlock(page);
  await dropFile(page, 'vpn.txt');
  await dropFile(page, 'other.txt');
  const row = page.getByRole('listitem').filter({ hasText: 'vpn.txt' });
  const otherRow = page.getByRole('listitem').filter({ hasText: 'other.txt' });
  await expect(row.locator('.code-value')).toBeVisible();
  await expect(otherRow.locator('.code-value')).toBeVisible();
  const original = await row.locator('.code-value').innerText();
  const taken = await otherRow.locator('.code-value').innerText();
  const lookup = (code: string) =>
    page.request.post('/api/lookup', {
      headers: { Origin: origin },
      data: { code },
    });
  const before = await lookup(original);
  expect(before.ok()).toBe(true);
  const { url } = downloadSchema.parse(await before.json());

  const edit = row.getByRole('button', { name: 'Edit code for vpn.txt' });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'edit code' });
  const input = dialog.getByRole('textbox', { name: 'Custom code' });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(original);
  await input.fill(taken.toLowerCase().replaceAll('-', ''));
  await input.press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText(
    'That code is already taken.',
  );
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.locator('form')).toHaveCSS('border-top-width', '1px');
  await expect(dialog.locator('form')).toHaveCSS(
    'border-top-color',
    'rgb(255, 130, 123)',
  );
  await input.fill('api');
  await input.press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText('That code is reserved.');
  await input.fill('TEST-PASSWORD');
  await input.press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText('That code is reserved.');
  await input.fill('vpn/setup');
  await input.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('Use 1–64');
  await input.fill('vpn');
  await dialog.getByRole('button', { name: 'Save code' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(
    row.getByRole('button', { name: 'Copy code VPN' }),
  ).toBeVisible();
  expect((await lookup(original)).status()).toBe(404);
  expect((await page.request.get(url)).status()).toBe(404);

  // an authenticated visit still follows the share path.
  await page.goto('/vpn');
  await expect(
    page.getByRole('link', { name: 'Download vpn.txt' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(`${origin}/`);

  const recipient = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: {
      'X-Forwarded-For': `recipient-${test.info().project.name}`,
    },
  });
  try {
    const share = await recipient.newPage();
    const downloads: string[] = [];
    share.on('download', (download) =>
      downloads.push(download.suggestedFilename()),
    );
    await share.goto('/vpn');
    const button = share.getByRole('link', { name: 'Download vpn.txt' });
    await expect(button).toBeFocused();
    await expect(
      share.getByRole('button', { name: 'back', exact: true }).locator('kbd'),
    ).toHaveText('Esc');
    expect(downloads).toEqual([]);
    const transfer = share.waitForEvent('download');
    await button.click();
    expect((await transfer).suggestedFilename()).toBe('vpn.txt');
    await share.getByRole('button', { name: 'back', exact: true }).click();
    await expect(share).toHaveURL(`${origin}/`);
    await share.getByLabel('Code or password').fill('Vpn');
    await share.getByRole('button', { name: 'Continue' }).click();
    await expect(button).toBeVisible();
    expect(downloads).toEqual(['vpn.txt']);
    await share.goto('/test-password');
    await expect(share.getByRole('alert')).toHaveText('Code not found.');
    expect((await share.request.get('/api/files')).status()).toBe(401);
  } finally {
    await recipient.close();
  }
});

test('keyboard navigation and reduced motion remain usable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByLabel('Code or password')).toBeFocused();
  await page.getByLabel('Code or password').fill('test-password');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: /drop files here/ }),
  ).toBeVisible();
});

test('screenshots', async ({ page }, info) => {
  await page.goto('/');
  await page.getByLabel('Code or password').waitFor();
  if (info.project.name === 'desktop') {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: 'docs/home.png' });
  }
  await unlock(page);
  await page.getByLabel('Choose files').setInputFiles([
    {
      name: 'field-notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('preview document'),
    },
    {
      name: 'weekend.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('preview archive'),
    },
    {
      name: 'wallpaper.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from('preview image'),
    },
  ]);
  await expect(page.getByRole('button', { name: /Copy code/ })).toHaveCount(2);
  await page.getByRole('tab', { name: 'gallery' }).click();
  await expect(
    page.getByRole('article', { name: 'wallpaper.heic' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Copy code/ })).toHaveCount(1);
  await page.getByRole('tab', { name: 'files' }).click();
  await expect(page.locator('.tab-indicator')).toHaveCSS('transform', 'none');
  for (const row of await page.getByRole('listitem').all()) {
    await expect(row).toHaveCSS('opacity', '1');
    await expect(row).toHaveCSS('transform', 'none');
  }
  await page.screenshot({
    path:
      info.project.name === 'desktop'
        ? 'docs/uploads.png'
        : 'test-results/iphone.png',
    fullPage: true,
  });
});
