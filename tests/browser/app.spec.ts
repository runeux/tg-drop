import { test, expect, type Page } from '@playwright/test';
import { filesResponseSchema } from '../../shared/files';

test.beforeEach(async ({ context }, info) => {
  // each isolated browser context represents a different client for rate limiting.
  await context.setExtraHTTPHeaders({
    'X-Forwarded-For': `e2e-${info.project.name}-${info.testId}`,
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
  await page.getByRole('button', { name: 'upload', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill('test-password');
  await page.getByRole('button', { name: 'Unlock uploads' }).click();
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

test('password gate, automatic upload, copy code and repeatable automatic downloads', async ({
  page,
  context,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'upload', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'download', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'upload', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill('incorrect');
  await page.getByRole('button', { name: 'Unlock uploads' }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect password.');
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill('test-password');
  await page.getByRole('button', { name: 'Unlock uploads' }).click();
  const name = `notes-${test.info().project.name}.txt`;
  await page.getByLabel('Choose files').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from('hello from browser'),
  });
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row.getByRole('button', { name: /Copy code/ })).toBeVisible();
  const code = await row.locator('.file-code > span').innerText();
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await row.getByRole('button', { name: /Copy code/ }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      code,
    );
  }
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'download', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'File code' })
    .fill(code.toLowerCase());
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Find file' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(name);
  expect(await download.failure()).toBeNull();
  const repeatPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Find file' }).click();
  expect(await (await repeatPromise).failure()).toBeNull();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'upload', exact: true }).click();
  await row.getByRole('button', { name: /^Delete / }).click();
  await row.getByRole('button', { name: /^Confirm delete / }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'download', exact: true }).click();
  await page.getByRole('textbox', { name: 'File code' }).fill(code);
  await page.getByRole('button', { name: 'Find file' }).click();
  await expect(page.getByRole('alert')).toHaveText('Code not found.');
  expect(errors).toEqual([]);
});

test('whole-page drop waits for password and files persist until manual removal', async ({
  page,
}) => {
  await page.goto('/');
  await dropFile(page, `pending-${test.info().project.name}.txt`);
  await expect(
    page.getByRole('textbox', { name: 'Password', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill('test-password');
  await page.getByRole('button', { name: 'Unlock uploads' }).click();
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
  await page.getByRole('button', { name: 'upload', exact: true }).click();
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

test('keyboard navigation and reduced motion remain usable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'upload', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('textbox', { name: 'Password', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill('test-password');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: /drop files here/ }),
  ).toBeVisible();
});

test('screenshots', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'upload', exact: true }).waitFor();
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
  await expect(page.getByRole('button', { name: /Copy code/ })).toHaveCount(3);
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
