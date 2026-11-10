import { createHash } from 'node:crypto';
import { test, expect, type Locator, type Page } from '@playwright/test';
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
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('button', { name: 'upload', exact: true }),
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

const mobileLayout = () => test.info().project.name === 'iphone';
const fileActions = (row: Locator) =>
  row.getByRole('button', { name: /^Actions for / });

const readyDownload = (row: Locator) =>
  row.getByRole('link', { name: /^Download / });

async function codeFor(page: Page, name: string) {
  const response = await page.request.get('/api/files');
  const { files } = filesResponseSchema.parse(await response.json());
  const file = files.find(
    (item) => item.name === name && item.status === 'ready',
  );
  if (!file) throw new Error(`missing ready file: ${name}`);
  return file.code;
}

async function deleteFile(page: Page, row: Locator) {
  await fileActions(row).click();
  await page
    .getByRole('menuitem', { name: 'delete file', exact: true })
    .click();
  await expect(row).toBeVisible();
  await page
    .getByRole('menuitem', { name: 'confirm delete', exact: true })
    .click();
}

test('password gate, automatic upload, copy code and repeatable manual downloads', async ({
  page,
  context,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const entry = page.getByLabel('Code', { exact: true });
  await expect(entry).toHaveAttribute('type', 'text');
  await expect(entry).toHaveAttribute('placeholder', 'code');
  await expect(entry).toHaveCSS('font-family', /monospace/);
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await entry.fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Code not found.');
  expect((await page.request.get('/api/files')).status()).toBe(401);
  const signIn = page.getByRole('button', { name: 'Sign in' });
  const [signInBox, entryFormBox] = await Promise.all([
    signIn.boundingBox(),
    page.locator('.entry-form').boundingBox(),
  ]);
  if (!signInBox || !entryFormBox) throw new Error('missing entry controls');
  expect(signInBox.x + signInBox.width).toBeLessThan(entryFormBox.x);
  const password = page.getByLabel('Password', { exact: true });
  await signIn.click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('placeholder', 'password');
  await expect(password).toBeFocused();
  await expect(password).toHaveValue('');
  await password.fill('test-password');
  await page.getByRole('button', { name: 'Use a code' }).click();
  await expect(entry).toBeFocused();
  await expect(entry).toHaveValue('');
  await signIn.click();
  await password.fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  const name = `notes-${test.info().project.name}.txt`;
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'upload', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from('hello from browser'),
  });
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(readyDownload(row)).toBeVisible();
  const code = await codeFor(page, name);
  expect(code.replaceAll('-', '')).toHaveLength(16);
  await expect(row.locator('.code-value')).toHaveCount(0);
  const trigger = fileActions(row);
  await expect(row.locator('.file-actions').locator('a, button')).toHaveCount(
    2,
  );
  if (mobileLayout()) {
    await expect(trigger).toHaveCSS('width', '44px');
    await expect(readyDownload(row)).toHaveCSS('height', '44px');
  }
  const filename = row.getByRole('button', {
    name: `Open preview for ${name}`,
  });
  const downloads: string[] = [];
  page.on('download', (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await filename.click();
  const peek = page.getByRole('dialog', { name: `Preview ${name}` });
  await expect(peek.getByRole('heading', { name })).toBeVisible();
  await expect(peek.locator('.peek-file-meta')).toContainText(code);
  await expect(
    peek.locator('.peek-file-artwork .file-type-icon'),
  ).toBeVisible();
  await expect(
    page
      .locator('.file-row')
      .filter({ hasText: name })
      .locator('.file-artwork'),
  ).toHaveCSS('opacity', '1');
  await expect(
    peek.getByRole('link', { name: `Download ${name}` }),
  ).toBeVisible();
  await expect(peek).toHaveCSS('background-color', 'oklch(0.205 0 0)');
  await expect(peek).toHaveCSS('backdrop-filter', 'none');
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
    'backdrop-filter',
    'none',
  );
  await expect(peek.locator('.peek-file-facts')).toHaveCSS('display', 'flex');
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await peek.getByRole('button', { name: 'Copy share link' }).click();
    await expect(
      peek.getByRole('status').filter({ hasText: 'link copied' }),
    ).toBeAttached();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      new URL(`/${code}`, page.url()).href,
    );
  }
  expect(downloads).toEqual([]);
  await peek.getByRole('button', { name: 'Close preview' }).click();
  await expect(peek).toHaveCount(0);
  await expect(filename).toBeFocused();
  await row.locator('.file-meta').click();
  await expect(peek).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(peek).toHaveCount(0);
  await expect(filename).toBeFocused();
  await expect(filename).toHaveCSS('outline-style', 'none');

  const nameDownload = page.waitForEvent('download');
  await readyDownload(row).click();
  expect(await (await nameDownload).failure()).toBeNull();
  expect(downloads).toEqual([name]);
  await expect(peek).toHaveCount(0);
  if (browserName === 'chromium') {
    const position = { x: 70, y: 18 };
    const bounds = await row.boundingBox();
    if (!bounds) throw new Error('missing file row');
    await row.click({ button: 'right', position });
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      'share link',
      'copy code',
      'edit code',
      'delete file',
    ]);
    await expect(menu).toHaveCSS('opacity', '1');
    const popup = await menu.boundingBox();
    expect(popup?.x).toBeCloseTo(bounds.x + position.x, 0);
    expect(popup?.y).toBeCloseTo(bounds.y + position.y, 0);
    await menu
      .getByRole('menuitem', { name: 'share link', exact: true })
      .click();
    await expect(row.getByRole('status')).toHaveText('Link copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      new URL(`/${code}`, page.url()).href,
    );
    await fileActions(row).click();
    await menu
      .getByRole('menuitem', { name: 'copy code', exact: true })
      .click();
    await expect(row.getByRole('status')).toHaveText('Code copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      code,
    );
  }
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel('Code', { exact: true }).fill(code.toLowerCase());
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
  await expect(page.getByLabel('Code', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Code', { exact: true })).toHaveValue('');
  await unlock(page);
  await deleteFile(page, row);
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel('Code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Code not found.');
  expect(errors).toEqual([]);
});

test('whole-page drop waits for password and files persist until manual removal', async ({
  page,
}) => {
  await page.goto('/');
  await dropFile(page, `pending-${test.info().project.name}.txt`);
  await expect(page.getByLabel('Code', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  const pendingRow = page
    .getByRole('listitem')
    .filter({ hasText: `pending-${test.info().project.name}.txt` });
  await expect(readyDownload(pendingRow)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'files', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.upload-header p')).toHaveText('1 file ・ 25 B');
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['drag test'], 'drag-test.txt'));
    return data;
  });
  const body = page.locator('body');
  await body.dispatchEvent('dragenter', {
    bubbles: true,
    dataTransfer: transfer,
  });
  const overlay = page.getByRole('status', { name: 'Drop to upload' });
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('backdrop-filter', 'blur(6px)');
  await expect(overlay).toHaveCSS('position', 'fixed');
  const size = page.viewportSize();
  expect(await overlay.boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: size?.width,
    height: size?.height,
  });
  await body.dispatchEvent('dragleave', {
    bubbles: true,
    dataTransfer: transfer,
  });
  await expect(overlay).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      document.body.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      ),
    ),
  ).toBe(false);
  await dropFile(page, `persistent-${test.info().project.name}.txt`);
  const persistentRow = page
    .getByRole('listitem')
    .filter({ hasText: `persistent-${test.info().project.name}.txt` });
  await expect(readyDownload(persistentRow)).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await unlock(page);
  await expect(persistentRow).toBeVisible();
  await deleteFile(page, persistentRow);
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
  await expect(readyDownload(row)).toBeVisible();
  await expect(readyDownload(otherRow)).toBeVisible();
  const original = await codeFor(page, 'vpn.txt');
  const taken = await codeFor(page, 'other.txt');
  const lookup = (code: string) =>
    page.request.post('/api/lookup', {
      headers: { Origin: origin },
      data: { code },
    });
  const before = await lookup(original);
  expect(before.ok()).toBe(true);
  const { url } = downloadSchema.parse(await before.json());

  const edit = fileActions(row);
  await edit.click();
  await page.getByRole('menuitem', { name: 'edit code', exact: true }).click();
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
    'oklch(0.704 0.191 22.216)',
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
  await expect(row.locator('.code-value')).toHaveText('VPN');
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
    await share.getByLabel('Code', { exact: true }).fill('Vpn');
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
  await expect(page.getByLabel('Code', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await expect(
    page.locator('.entry-placeholder').getByText('password', { exact: true }),
  ).toHaveCSS('opacity', '1');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'upload', exact: true }),
  ).toBeVisible();
});

test('library search combines filename, code and type filters', async ({
  page,
}) => {
  await page.goto('/');
  await unlock(page);
  await expect(page.getByRole('tablist')).toHaveCount(0);

  const search = page.getByRole('searchbox', { name: 'Search files' });
  const typeFilter = page.getByRole('button', { name: 'Filters' });
  const menu = page.getByRole('menu');
  const types = menu.getByRole('group', { name: 'file types' });
  const all = types.getByRole('menuitem', { name: 'select all file types' });
  await typeFilter.click();
  await expect(types.getByRole('menuitemcheckbox')).toHaveCount(0);
  await expect(all).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByLabel('Choose files').setInputFiles([
    ...['field-notes.TXT', 'meeting.txt', 'schedule.pdf', 'LICENSE'].map(
      (name) => ({
        name,
        mimeType: 'text/plain',
        buffer: Buffer.from('example file'),
      }),
    ),
    {
      name: 'diagram.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>',
      ),
    },
  ]);
  const rows = page
    .getByRole('list', { name: 'Files', exact: true })
    .getByRole('listitem');
  await expect(readyDownload(rows)).toHaveCount(5);
  const pdf = rows.filter({ hasText: 'schedule.pdf' });
  await expect(pdf.locator('.file-type-icon')).toHaveAttribute(
    'src',
    '/assets/file-icons-v2/pdf.svg',
  );
  const code = await codeFor(page, 'schedule.pdf');
  await search.fill('FIELD-NOTES');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('field-notes.TXT');
  await search.fill(code.toLowerCase());
  await expect(pdf).toBeVisible();
  await expect(rows).toHaveCount(1);

  await typeFilter.click();
  const pdfType = types.getByRole('menuitemcheckbox', {
    name: 'pdf',
    exact: true,
  });
  const txtType = types.getByRole('menuitemcheckbox', {
    name: 'txt',
    exact: true,
  });
  await expect(txtType).toHaveAttribute('aria-checked', 'true');
  await expect(
    types.getByRole('menuitemcheckbox', { name: 'no extension' }),
  ).toBeVisible();
  await expect(
    types.getByRole('menuitemcheckbox', { name: 'svg' }),
  ).toBeVisible();
  await expect(types.getByRole('menuitemcheckbox')).toHaveCount(4);
  await txtType.click();
  await expect(all).toBeEnabled();
  await expect(pdfType).toHaveAttribute('aria-checked', 'false');
  await expect(txtType).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('no matching files')).toBeVisible();
  await all.click();
  await expect(all).toBeDisabled();
  await expect(pdfType).toHaveAttribute('aria-checked', 'true');
  await expect(pdf).toBeVisible();

  await pdfType.click();
  await page.keyboard.press('Escape');
  await search.fill('');
  await expect(rows).toHaveCount(1);
  await expect(pdf).toBeVisible();
  await page.getByRole('button', { name: 'Clear file types filter' }).click();
  await expect(rows).toHaveCount(5);
  await expect(
    page.getByRole('button', { name: 'Open preview for diagram.svg' }),
  ).toBeVisible();
});

test('screenshots', async ({ page }, info) => {
  await page.goto('/');
  await page.getByLabel('Code', { exact: true }).waitFor();
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
  await expect(
    page.getByRole('button', {
      name: /^Actions for /,
    }),
  ).toHaveCount(3);
  await expect(
    page.getByRole('button', { name: 'Open preview for wallpaper.heic' }),
  ).toBeVisible();
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
