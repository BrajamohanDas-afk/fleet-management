import { Page } from '@playwright/test';

export async function login(page: Page): Promise<void> {
  const username = process.env.E2E_ADMIN_USERNAME ?? 'fleet-admin';
  const password = process.env.E2E_ADMIN_PASSWORD ?? 'FleetOps@2026';

  await page.goto('/login');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard/vehicles');
}
