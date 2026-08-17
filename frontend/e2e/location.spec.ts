import { test, expect } from '@playwright/test';
import { login } from './auth';

test.describe('Vehicle Location page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/location');
  });

  test('renders map canvas and live feed indicator', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Vehicle Location' })).toBeVisible();

    const map = page.locator('[data-testid="fleet-map-container"]');
    await expect(map).toBeVisible();

    const feedIndicator = page.getByTitle(/Live position feed/);
    await expect(feedIndicator).toBeVisible();
  });
});
