import { Page } from '@playwright/test';

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard/vehicles');
}
