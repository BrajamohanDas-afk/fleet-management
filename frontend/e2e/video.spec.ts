import { test, expect } from '@playwright/test';
import { login } from './auth';

test.describe('Video Telematics page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/video');
  });

  test('selects a vehicle and starts cameras', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Video Telematics' })).toBeVisible();

    // Ensure a vehicle is selected in the dropdown.
    const vehicleSelect = page.locator('select');
    await expect(vehicleSelect).toBeVisible();
    const options = await vehicleSelect.locator('option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(1);

    if (options.length > 1) {
      await vehicleSelect.selectOption({ index: 1 });
    }

    // Click the primary Start Cameras control.
    const startButton = page.locator('button:has-text("Start Cameras")');
    await expect(startButton).toBeVisible();
    await startButton.click();

    // Wait briefly for the panel state to leave idle.
    await page.waitForTimeout(2000);
    const idlePanel = page.locator('text=Stream stopped');
    await expect(idlePanel).toHaveCount(0, { timeout: 5000 });
  });
});
