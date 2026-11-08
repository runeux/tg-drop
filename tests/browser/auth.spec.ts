import { expect, test } from '@playwright/test';

test('restores login without flashing the entry form and back revokes it', async ({
  page,
  context,
  browser,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Uploads', { exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(
    (entry) => entry.name === 'drop_session',
  );
  expect(cookie?.httpOnly).toBe(true);
  // compare against the browser's own expiry policy; linux webkit caps earlier.
  await page.route('**/api/session-cookie-policy', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie':
          'drop_policy_reference=1; Max-Age=34560000; Path=/api; HttpOnly; SameSite=Strict',
      },
      body: 'ok',
    }),
  );
  await page.evaluate(() => fetch('/api/session-cookie-policy'));
  const reference = (await context.cookies()).find(
    (entry) => entry.name === 'drop_policy_reference',
  );
  expect(reference).toBeDefined();
  expect(cookie).toBeDefined();
  if (!cookie || !reference) throw new Error('missing persistent cookie');
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000);
  expect(Math.abs(cookie.expires - reference.expires)).toBeLessThan(5);
  await context.clearCookies({ name: 'drop_policy_reference' });
  await page.unroute('**/api/session-cookie-policy');

  const returning = await browser.newContext({
    storageState: await context.storageState(),
  });
  try {
    const tab = await returning.newPage();
    await tab.route('**/api/session', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });
    await tab.goto('/');
    await expect(tab.getByLabel('Code', { exact: true })).toHaveCount(0);
    await expect(tab.getByLabel('Uploads', { exact: true })).toBeVisible();
    await tab.reload();
    await expect(tab.getByLabel('Code', { exact: true })).toHaveCount(0);
    await expect(tab.getByLabel('Uploads', { exact: true })).toBeVisible();
    await tab.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(tab.getByLabel('Code', { exact: true })).toBeVisible();
    expect((await tab.request.get('/api/files')).status()).toBe(401);
    expect((await page.request.get('/api/files')).status()).toBe(401);
    await tab.reload();
    await expect(tab.getByLabel('Code', { exact: true })).toBeVisible();
    expect(
      (await returning.cookies()).some(
        (entry) => entry.name === 'drop_session',
      ),
    ).toBe(false);
  } finally {
    await returning.close();
  }
});

test('failed logout stays on the dashboard and offers a retry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Uploads', { exact: true })).toBeVisible();
  await page.route('**/api/session', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Connection lost. Try again.' },
    }),
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Connection lost. Try again.',
  );
  await expect(page.getByLabel('Uploads', { exact: true })).toBeVisible();
  await page.unroute('**/api/session');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('Code', { exact: true })).toBeVisible();
});
