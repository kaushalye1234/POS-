const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Fashion Shaa POS App', () => {
  test('should open main window and verify title', async ({ page }) => {
    const indexPath = `file:///${path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/')}`;
    await page.goto(indexPath, { waitUntil: 'domcontentloaded' });
    
    await expect(page).toHaveTitle(/Fashion Shaa - Premium POS/);
  });

  test('should display POS main features', async ({ page }) => {
    const indexPath = `file:///${path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/')}`;
    await page.goto(indexPath, { waitUntil: 'domcontentloaded' });

    const itemName = page.locator('#itemName');
    await expect(itemName).toBeVisible();

    const priceDisplay = page.locator('#priceDisplay');
    await expect(priceDisplay).toBeVisible();

    const grandTotal = page.locator('#grandTotal');
    await expect(grandTotal).toBeVisible();
    
    const checkoutBtn = page.locator('#checkout');
    await expect(checkoutBtn).toBeVisible();
  });
});


