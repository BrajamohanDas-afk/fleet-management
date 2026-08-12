import { test, expect } from '@playwright/test';
import { login } from './auth';

test.describe('Vehicle Location page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/location');
  });

  test('renders map canvas and live feed indicator', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Vehicle Location' })).toBeVisible();

    // Leaflet renders tile images inside a div with class leaflet-container.
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();

    const feedIndicator = page.getByTitle(/Live position feed/);
    await expect(feedIndicator).toBeVisible();
  });
});
