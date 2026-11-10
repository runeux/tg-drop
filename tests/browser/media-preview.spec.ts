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
      bytes: await readFile('tests/fixtures/gallery.gif'),
    },
    {
      name: 'video.mp4',
      mime: 'video/mp4',
      bytes: await readFile('tests/fixtures/gallery.mp4'),
    },
    {
      name: 'notes.unknown',
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

test('one list shows square thumbnails and opens the fullscreen viewer', async ({
  page,
  context,
  browserName,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const ids = await seed(page);
  let release = () => {};
  try {
    if (info.project.name === 'desktop')
      await page.setViewportSize({ width: 1440, height: 1000 });
    const previewsReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/files/*/preview', async (route) => {
      await previewsReady;
      await route.continue();
    });
    await page.route(`**/api/files/${ids[1]}/preview`, (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.goto('/');
    const rows = page
      .getByRole('list', { name: 'Files', exact: true })
      .getByRole('listitem');
    await expect(rows).toHaveCount(7);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    const unknown = rows.filter({ hasText: 'notes.unknown' });
    await expect(
      unknown.getByRole('button', { name: 'Open preview for notes.unknown' }),
    ).toBeVisible();
    await expect(unknown.locator('.file-type-icon')).toHaveAttribute(
      'src',
      '/assets/file-icons-v2/unknown.svg',
    );
    await expect(unknown.locator('.file-type-icon')).toHaveCSS(
      'height',
      '48px',
    );
    await expect(unknown.locator('.file-artwork')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    const wide = rows.filter({ hasText: 'wide.svg' });
    const openWide = wide.getByRole('button', {
      name: 'Open preview for wide.svg',
    });
    const artwork = wide.locator('.file-preview');
    await artwork.scrollIntoViewIfNeeded();
    await expect(wide).toHaveCSS('transform', 'none');
    const before = await artwork.boundingBox();
    if (!before) throw new Error('missing thumbnail');
    expect(before.width).toBe(48);
    expect(before.height).toBe(before.width);
    await expect(artwork).toHaveAttribute('data-status', 'loading');
    release();
    const thumbnail = artwork.locator('img.file-thumbnail');
    await expect(artwork).toHaveAttribute('data-status', 'ready');
    await expect(thumbnail).toHaveJSProperty('naturalWidth', 1600);
    await expect(thumbnail).toHaveCSS('object-fit', 'cover');
    expect(await artwork.boundingBox()).toEqual(before);

    const unavailable = rows
      .filter({ hasText: 'portrait.svg' })
      .locator('.file-preview');
    await unavailable.scrollIntoViewIfNeeded();
    await expect(unavailable).toHaveAttribute('data-status', 'failed');
    await expect(unavailable.locator('.file-type-icon')).toHaveAttribute(
      'src',
      '/assets/file-icons-v2/svg.svg',
    );
    await unavailable.click();
    const fallback = page.getByRole('dialog', { name: 'Preview portrait.svg' });
    await expect(
      fallback.getByRole('heading', { name: 'portrait.svg' }),
    ).toBeVisible();
    await fallback.getByRole('button', { name: 'Close preview' }).click();
    await expect(fallback).toHaveCount(0);

    await artwork.click();
    const viewer = page.getByRole('dialog', { name: 'Preview wide.svg' });
    await expect(viewer).toBeVisible();
    const image = viewer.locator('img');
    await expect(image).toHaveCSS('object-fit', 'contain');
    await expect
      .poll(async () => (await image.boundingBox())?.width)
      .toBeCloseTo(
        (page.viewportSize()?.width ?? 0) *
          (info.project.name === 'desktop' ? 0.8 : 1),
        0,
      );
    const mobile = info.project.name === 'iphone';
    const mobileActions = viewer.getByRole('button', {
      name: 'Actions for wide.svg',
    });
    const mobileItem = (name: string) =>
      page.getByRole('menuitem', { name, exact: true });
    if (mobile) {
      await expect(viewer.locator('.viewer-code')).toHaveText(
        /^[2-9A-HJ-NP-Z-]{19}$/,
      );
      await expect(viewer.locator('.peek-close-back')).toBeVisible();
      await expect(viewer.locator('.viewer-stage')).toHaveCSS(
        'padding-top',
        '0px',
      );
      await mobileActions.tap();
      await expect(mobileItem('share link')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(viewer).toBeVisible();
    }
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await viewer.getByRole('button', { name: /Copy code/ }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
        /^[2-9A-HJ-NP-Z-]{19}$/,
      );
    }
    const download = page.waitForEvent('download');
    if (mobile) {
      await mobileActions.tap();
      await mobileItem('download').tap();
    } else {
      await viewer.getByRole('link', { name: 'Download wide.svg' }).click();
    }
    expect((await download).suggestedFilename()).toBe('wide.svg');
    if (mobile) {
      await mobileActions.tap();
      await mobileItem('edit code').tap();
    } else {
      await viewer
        .getByRole('button', { name: 'Edit code for wide.svg' })
        .click();
    }
    const editor = page.getByRole('dialog', { name: 'edit code' });
    await editor
      .getByRole('textbox', { name: 'Custom code' })
      .fill('wide.preview');
    await editor.getByRole('button', { name: 'Save code' }).click();
    if (mobile) {
      await expect(viewer.locator('.viewer-code')).toHaveText('WIDE.PREVIEW');
    } else {
      await expect(
        viewer.getByRole('button', { name: 'Copy code WIDE.PREVIEW' }),
      ).toBeVisible();
    }

    if (info.project.name === 'desktop') await page.keyboard.press('Escape');
    else await viewer.getByRole('button', { name: 'Close preview' }).click();
    await expect(viewer).toHaveCount(0);
    await expect(openWide).toBeFocused();

    const openVideo = rows
      .filter({ hasText: 'video.mp4' })
      .locator('.file-preview');
    await openVideo.scrollIntoViewIfNeeded();
    await expect(openVideo.locator('video')).toHaveJSProperty(
      'videoWidth',
      320,
    );
    await openVideo.click();
    const videoViewer = page.getByRole('dialog', { name: 'Preview video.mp4' });
    await expect(videoViewer.locator('video')).toHaveAttribute('controls', '');
    await videoViewer.getByRole('button', { name: 'Close preview' }).click();
    await expect(videoViewer).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWide.click();
    await expect(viewer).toHaveCSS('transform', 'none');
    if (mobile) {
      await mobileActions.tap();
      await mobileItem('delete file').tap();
      await mobileItem('confirm delete').tap();
    } else {
      await viewer
        .getByRole('button', { name: 'Delete wide.svg', exact: true })
        .click();
      await viewer
        .getByRole('button', { name: 'Confirm delete wide.svg', exact: true })
        .click();
    }
    await expect(viewer).toHaveCount(0);
    await expect(wide).toHaveCount(0);
  } finally {
    release();
    for (const id of ids)
      await page.request.delete(`/api/files/${id}`, {
        headers: { Origin: origin },
      });
  }
});
