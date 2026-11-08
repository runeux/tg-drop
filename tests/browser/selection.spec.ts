import { test, expect } from '@playwright/test';
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import { filesResponseSchema } from '../../shared/files';

test.beforeEach(async ({ page, context }, info) => {
  await context.setExtraHTTPHeaders({
    'X-Forwarded-For': `selection-${info.project.name}-${info.testId}`,
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Choose files')).toBeAttached();
});

test.afterEach(async ({ page }) => {
  const response = await page.request.get('/api/files');
  if (!response.ok()) return;
  for (const file of filesResponseSchema.parse(await response.json()).files) {
    await page.request.delete(`/api/files/${file.id}`, {
      headers: { Origin: 'http://127.0.0.1:4173' },
    });
  }
});

test('a dropped folder becomes a ZIP with its nested files intact', async ({
  page,
}) => {
  const request = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/api/files'),
  );
  await page.evaluate(() => {
    const note = new File(['nested file contents'], 'notes.txt', {
      type: 'text/plain',
    });
    const leaf = {
      name: note.name,
      isFile: true,
      isDirectory: false,
      file: (success: (file: File) => void) => success(note),
    };
    const folder = (name: string, children: object[]) => ({
      name,
      isFile: false,
      isDirectory: true,
      createReader() {
        let read = false;
        return {
          readEntries(success: (entries: object[]) => void) {
            success(read ? [] : children);
            read = true;
          },
        };
      },
    });
    const root = folder('bundle', [
      folder('nested', [leaf]),
      folder('empty', []),
    ]);
    const transfer = new DataTransfer();
    const item = transfer.items.add(
      new File(['directory placeholder'], 'bundle'),
    );
    if (!item) throw new Error('missing drag item');
    const original = DataTransferItem.prototype.webkitGetAsEntry;
    Object.defineProperty(DataTransferItem.prototype, 'webkitGetAsEntry', {
      configurable: true,
      value: () => root,
    });
    try {
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer }));
    } finally {
      Object.defineProperty(DataTransferItem.prototype, 'webkitGetAsEntry', {
        configurable: true,
        value: original,
      });
    }
  });
  const upload = await request;
  expect(upload.headers()['x-file-name']).toBe('bundle.zip');
  const row = page.getByRole('listitem').filter({ hasText: 'bundle.zip' });
  await expect(row.locator('.code-value')).toBeVisible();
  const url = await row.locator('a[download]').getAttribute('href');
  if (!url) throw new Error('missing download url');
  const response = await page.request.get(url);
  expect(response.ok()).toBe(true);
  const data = await response.body();
  const zip = new ZipReader(new BlobReader(new Blob([new Uint8Array(data)])), {
    useWebWorkers: false,
  });
  try {
    const entries = await zip.getEntries();
    const note = entries.find(
      (entry) => entry.filename === 'bundle/nested/notes.txt',
    );
    if (!note || note.directory) throw new Error('nested file was lost');
    expect(await note.getData(new TextWriter())).toBe('nested file contents');
    expect(entries.some((entry) => entry.filename === 'bundle/empty/')).toBe(
      true,
    );
  } finally {
    await zip.close();
  }
  await expect(row.locator('.code-value')).toBeVisible();
});

test('invalid selections never reach the upload endpoint', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/files'))
      uploads.push(request.url());
  });
  await page.getByLabel('Choose files').setInputFiles({
    name: 'empty.txt',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(0),
  });
  await expect(page.getByRole('alert')).toContainText(
    'Empty files are not supported',
  );
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    const oversized = new File(['x'], 'too-large.bin');
    Object.defineProperty(oversized, 'size', { value: 2_000_000_001 });
    transfer.items.add(oversized);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer }));
  });
  await expect(
    page.getByRole('alert').filter({ hasText: 'too-large.bin' }),
  ).toContainText('Maximum file size');
  expect(uploads).toEqual([]);
});

test('upload errors use a full-width row and size stays on one line', async ({
  page,
}) => {
  const failure =
    'Upload rejected. This is a deliberately long error message with details that must wrap across the full file row without squeezing the file size or the action buttons.';
  await page.route('**/api/files', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: failure }),
        })
      : route.continue(),
  );
  await page.getByLabel('Choose files').setInputFiles({
    name: 'rejected.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(1_500_000),
  });
  const row = page.getByRole('listitem').filter({ hasText: 'rejected.bin' });
  const error = row.locator('.file-error');
  await expect(error).toHaveText(failure);
  await expect(row.locator('.file-size')).toHaveText('1.5\u00a0MB');
  await expect(row.locator('.file-meta')).not.toContainText(failure);
  const dimensions = await row.evaluate((element) => {
    const error = element.querySelector('.file-error')?.getBoundingClientRect();
    const meta = element.querySelector('.file-meta')?.getBoundingClientRect();
    return {
      row: element.getBoundingClientRect().width,
      error: error?.width ?? 0,
      errorTop: error?.top ?? 0,
      metaBottom: meta?.bottom ?? 0,
    };
  });
  expect(dimensions.error).toBeGreaterThanOrEqual(dimensions.row - 30);
  expect(dimensions.errorTop).toBeGreaterThan(dimensions.metaBottom);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/error-${test.info().project.name}.png`,
    fullPage: true,
  });
});
