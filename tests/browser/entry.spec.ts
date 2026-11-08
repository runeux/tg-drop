import { expect, test } from '@playwright/test';
import { filesResponseSchema } from '../../shared/files';

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({
    'X-Forwarded-For': `entry-${info.project.name}-${info.testId}`,
  });
});

test.afterEach(async ({ page }) => {
  const login = await page.request.post('/api/session', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { password: 'test-password' },
  });
  expect(login.ok()).toBe(true);
  const response = await page.request.get('/api/files');
  expect(response.ok()).toBe(true);
  for (const file of filesResponseSchema.parse(await response.json()).files) {
    const deletion = await page.request.delete(`/api/files/${file.id}`, {
      headers: { Origin: 'http://127.0.0.1:4173' },
    });
    expect(deletion.ok()).toBe(true);
  }
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`code reveal, keyboard download and interrupted reset (${reducedMotion})`, async ({
    page,
  }) => {
    const name =
      'field-notes-with-a-very-long-filename-for-the-smallest-screen.pdf';
    await page.emulateMedia({ reducedMotion });
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByLabel('Password', { exact: true }).press('Enter');
    await page.getByLabel('Choose files').setInputFiles({
      name,
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(2_400_000, 'x'),
    });
    const row = page.getByRole('listitem').filter({ hasText: name });
    await expect(row.locator('.code-value')).toBeVisible();
    const code = await row.locator('.code-value').innerText();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const input = page.getByLabel('Code', { exact: true });
    await input.fill(code);
    await expect(page.locator('.screen-entry')).toHaveCSS('transform', 'none');
    const downloads: string[] = [];
    page.on('download', (download) =>
      downloads.push(download.suggestedFilename()),
    );
    await input.press('Enter');
    const button = page.getByRole('link', { name: `Download ${name}` });
    await expect(button).toBeFocused();
    expect(downloads).toEqual([]);
    const repeated = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect(await (await repeated).failure()).toBeNull();
    await expect(page.locator('.download-name')).toHaveAttribute('title', name);
    await expect(page.locator('.download-meta')).toContainText('pdf document');
    await expect(page.locator('.download-meta')).toContainText('2.4\u00a0MB');
    await expect(page.locator('.entry-form')).toHaveCSS('height', '66px');
    const form = await page.locator('.entry-form').boundingBox();
    const back = page.getByRole('button', { name: 'back', exact: true });
    const reset = await back.boundingBox();
    expect(form).not.toBeNull();
    expect(reset).not.toBeNull();
    if (!form || !reset) throw new Error('missing entry controls');
    expect(reset.y).toBeGreaterThan(form.y + form.height);
    expect(reset.height).toBeGreaterThanOrEqual(44);
    if (reducedMotion === 'reduce') {
      await expect(page.locator('.entry-input-row')).toHaveCSS(
        'transform',
        'none',
      );
      await expect(button).toHaveCSS('filter', 'blur(0px)');
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press('Tab');
    await expect(back).toBeFocused();
    // reverse while the reveal can still be moving, then immediately submit again.
    await page.keyboard.press('Escape');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');
    await input.fill(code);
    await input.press('Enter');
    await expect(button).toBeFocused();
    expect(downloads).toEqual([name]);
    // escape also works after focus leaves the result controls.
    await button.evaluate((element) => element.blur());
    await expect(button).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(input).toBeFocused();
    await expect(page.locator('.entry-form')).toHaveCSS('height', '66px');
    await expect(
      page.getByRole('link', { name: `Download ${name}` }),
    ).toHaveCount(0);
    await page.goto(`/${code}`);
    await expect(button).toBeFocused();
    expect(downloads).toEqual([name]);
  });
}
