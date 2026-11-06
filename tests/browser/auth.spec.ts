import { expect, test } from '@playwright/test';

test('restores login without flashing the entry form and back revokes it', async ({
  page,
  context,
  browser,
}) => {
  await page.goto('/');
  await page.getByLabel('Code or password').fill('test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Uploads', { exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(
    (entry) => entry.name === 'drop_session',
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 399 * 86400);

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
    await expect(tab.getByLabel('Code or password')).toHaveCount(0);
    await expect(tab.getByLabel('Uploads', { exact: true })).toBeVisible();
    await tab.reload();
    await expect(tab.getByLabel('Code or password')).toHaveCount(0);
    await expect(tab.getByLabel('Uploads', { exact: true })).toBeVisible();
    await tab.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(tab.getByLabel('Code or password')).toBeVisible();
    expect((await tab.request.get('/api/files')).status()).toBe(401);
    expect((await page.request.get('/api/files')).status()).toBe(401);
    await tab.reload();
    await expect(tab.getByLabel('Code or password')).toBeVisible();
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
  await page.getByLabel('Code or password').fill('test-password');
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
  await expect(page.getByLabel('Code or password')).toBeVisible();
});
