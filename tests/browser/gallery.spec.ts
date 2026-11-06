import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { filesResponseSchema } from '../../shared/files';

const origin = 'http://127.0.0.1:4173';

async function seed(page: Page) {
  const login = await page.request.post('/api/session', {
    headers: { Origin: origin },
    data: { password: 'test-password' },
  });
  expect(login.ok()).toBe(true);
  const samples = [
    {
      name: 'wide.svg',
      mime: 'image/svg+xml',
      width: 1600,
      height: 900,
      color: '#8b633e',
    },
    {
      name: 'portrait.svg',
      mime: 'image/svg+xml',
      width: 900,
      height: 1400,
      color: '#667c69',
    },
    {
      name: 'document-image.svg',
      mime: 'application/octet-stream',
      width: 1000,
      height: 1000,
      color: '#7a7795',
    },
    {
      name: 'panorama.svg',
      mime: 'image/svg+xml',
      width: 1800,
      height: 700,
      color: '#577687',
    },
  ];
  const uploads = samples.map((sample) => ({
    name: sample.name,
    mime: sample.mime,
    bytes: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${sample.width}" height="${sample.height}" viewBox="0 0 ${sample.width} ${sample.height}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${sample.color}"/><stop offset="1" stop-color="#1c2632"/></linearGradient></defs><path fill="url(#g)" d="M0 0h${sample.width}v${sample.height}H0z"/><circle cx="${sample.width * 0.7}" cy="${sample.height * 0.3}" r="${sample.width * 0.12}" fill="#fff3"/><path d="M0 ${sample.height}L${sample.width * 0.4} ${sample.height * 0.35}L${sample.width} ${sample.height}Z" fill="#0003"/></svg>`,
    ),
  }));
  uploads.push(
    {
      name: 'animation.gif',
      mime: 'image/gif',
      bytes: Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      ),
    },
    {
      name: 'video.mp4',
      mime: 'video/mp4',
      bytes: await readFile('tests/fixtures/gallery.mp4'),
    },
    {
      name: 'notes.txt',
      mime: 'text/plain',
      bytes: Buffer.from('ordinary file'),
    },
  );
  const ids: string[] = [];
  for (const item of uploads) {
    const id = randomUUID();
    ids.push(id);
    const response = await page.request.post('/api/files', {
      headers: {
        Origin: origin,
        'x-upload-id': id,
        'x-file-name': item.name,
        'x-file-size': String(item.bytes.length),
        'Content-Type': item.mime,
      },
      data: item.bytes,
    });
    expect(response.status()).toBe(201);
  }
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/files');
      const { files } = filesResponseSchema.parse(await response.json());
      return files.filter(
        (file) => ids.includes(file.id) && file.status === 'ready',
      ).length;
    })
    .toBe(7);
  return ids;
}

test('gallery partitions media, preserves proportions and opens a responsive fullscreen viewer', async ({
  page,
  context,
  browserName,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const ids = await seed(page);
  try {
    if (info.project.name === 'desktop')
      await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'files' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByRole('link', { name: 'notes.txt', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'wide.svg', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('tab', { name: 'gallery' }).click();
    await expect(
      page.getByRole('link', { name: 'notes.txt', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.gallery-card')).toHaveCount(6);
    const wide = page.getByRole('article', { name: 'wide.svg', exact: true });
    const portrait = page.getByRole('article', {
      name: 'portrait.svg',
      exact: true,
    });
    await expect
      .poll(() =>
        wide
          .locator('img')
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(1600);
    await expect
      .poll(() =>
        portrait
          .locator('img')
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(900);
    const bounds = await wide.boundingBox();
    const tall = await portrait.boundingBox();
    expect(bounds).not.toBeNull();
    expect(tall).not.toBeNull();
    if (!bounds || !tall) throw new Error('missing gallery bounds');
    expect(bounds.width / bounds.height).toBeCloseTo(16 / 9, 1);
    expect(tall.width / tall.height).toBeCloseTo(9 / 14, 1);
    const columns = await page.locator('.react-photo-album--track').count();
    expect(columns).toBe(info.project.name === 'desktop' ? 4 : 2);
    if (info.project.name === 'desktop') await wide.hover();
    await expect(wide.locator('.gallery-actions')).toHaveCSS('opacity', '1');
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await wide.getByRole('button', { name: /Copy code/ }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
        /^[2-9A-HJ-NP-Z-]{19}$/,
      );
    }
    const download = page.waitForEvent('download');
    await wide.getByRole('link', { name: 'Download wide.svg' }).click();
    expect((await download).suggestedFilename()).toBe('wide.svg');
    await wide
      .getByRole('button', { name: 'Open wide.svg' })
      .click({ position: { x: 20, y: 20 } });
    const viewer = page.getByRole('dialog', { name: 'Preview wide.svg' });
    await expect(viewer).toBeVisible();
    const image = viewer.locator('img');
    await expect(image).toHaveCSS('object-fit', 'contain');
    const size = await image.boundingBox();
    expect(size?.width).toBeCloseTo(
      (page.viewportSize()?.width ?? 0) *
        (info.project.name === 'desktop' ? 0.8 : 1),
      0,
    );
    await page.screenshot({
      path: `test-results/gallery-fullscreen-${info.project.name}.png`,
    });
    if (info.project.name === 'desktop') await page.keyboard.press('Escape');
    else await viewer.getByRole('button', { name: 'Close preview' }).click();
    await expect(viewer).toHaveCount(0);
    await expect(
      wide.getByRole('button', { name: 'Open wide.svg' }),
    ).toBeFocused();
    const video = page.getByRole('article', { name: 'video.mp4', exact: true });
    await video.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        video
          .locator('video')
          .evaluate((element: HTMLVideoElement) => element.videoWidth),
      )
      .toBe(320);
    await video
      .getByRole('button', { name: 'Open video.mp4' })
      .click({ position: { x: 20, y: 20 } });
    await expect(page.getByRole('dialog').locator('video')).toHaveAttribute(
      'controls',
      '',
    );
    await page.getByRole('button', { name: 'Close preview' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/gallery-${info.project.name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await page.getByRole('tab', { name: 'gallery' }).focus();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'files' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'files' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'gallery' })).toBeFocused();
    await wide
      .getByRole('button', { name: 'Open wide.svg' })
      .click({ position: { x: 20, y: 20 } });
    await page
      .getByRole('button', { name: 'Delete wide.svg', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm delete wide.svg', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(wide).toHaveCount(0);
  } finally {
    for (const id of ids)
      await page.request.delete(`/api/files/${id}`, {
        headers: { Origin: origin },
      });
  }
});
