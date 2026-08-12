import { test, expect } from '@playwright/test';
import { login } from './auth';

test.describe('Vehicles page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('displays vehicle cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Vehicles' })).toBeVisible();
    await expect(page.locator('text=Manage your fleet registry')).toBeVisible();

    // Wait for loading to finish and assert at least one card or the empty state.
    await page.waitForSelector('text=Loading vehicles…', { state: 'hidden' });
    const cards = page.locator('[class*="VehicleCard"], .rounded-xl.bg-white');
    await expect(cards.first()).toBeVisible();
  });

  test('search filter narrows results', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Vehicles' })).toBeVisible();
    await page.waitForSelector('text=Loading vehicles…', { state: 'hidden' });

    const searchInput = page.locator('input[placeholder*="Search plate"], input[placeholder*="Search plate or vehicle code"]');
    await expect(searchInput).toBeVisible();

    // Use a query unlikely to match any seeded vehicle to verify filtering.
    await searchInput.fill('ZZZ-NOMATCH');
    await page.waitForTimeout(300);

    await expect(page.locator('text=No vehicles match your filters.')).toBeVisible();
  });
});
